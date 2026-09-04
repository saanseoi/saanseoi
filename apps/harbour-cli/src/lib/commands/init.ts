import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { note } from '@clack/prompts'

import { registerInterruptCleanup } from '../cli/interrupt.ts'
import type { ParsedArgs } from '../cli/options.ts'
import {
  parseInitialisationSummaryEvents,
  recordInitialisationSummaryEvent,
  type InitialisationSummaryEvent,
} from './initialisationSummary.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../')

const initialisationCommands = {
  init: {
    script: 'scripts/init/all.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:local': {
    script: 'scripts/init/local.fish',
    supportsContinue: false,
    supportsTarget: false,
  },
  'init:production': {
    script: 'scripts/init/production.fish',
    supportsContinue: false,
    supportsTarget: false,
  },
  'init:addresses:official': {
    script: 'scripts/init/addresses-hkgov-dpo.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:stats:official': {
    script: 'scripts/init/stats-hkgov-censtatd.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:hkgov-pland-new-town': {
    script: 'scripts/init/divisions-hkgov-pland-new-town.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:hkgov-pland-pu': {
    script: 'scripts/init/divisions-hkgov-pland-pu.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:hkgov-landsd': {
    script: 'scripts/init/divisions-hkgov-landsd.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:divisions:geographic': {
    script: 'scripts/init/divisions-overture.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:places:overture': {
    script: 'scripts/init/places-overture.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:streets:hkgov-landsd': {
    script: 'scripts/init/streets-hkgov-landsd.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
} as const

export type InitialisationCommand = keyof typeof initialisationCommands

export function resolveInitialisationCommand(command: string) {
  return initialisationCommands[command as InitialisationCommand]
}

type InitialisationSubprocess = {
  kill(signal?: number | NodeJS.Signals): void
  pid: number
}

type ProcessSignaller = {
  kill(pid: number, signal: NodeJS.Signals): void
  platform: string
}

/** Signal every process started by an initialisation script. */
export function interruptInitialisationProcess(
  child: InitialisationSubprocess,
  signal: NodeJS.Signals,
  processRef: ProcessSignaller = process,
) {
  if (processRef.platform === 'win32') {
    child.kill(signal)
    return
  }

  try {
    // `detached` makes the Fish script the leader of its own process group.
    // A negative PID targets it and every nested `saanseoi` command.
    processRef.kill(-child.pid, signal)
  } catch {
    // The child can finish between the interrupt and this signal. Fall back to
    // its direct handle when the process group is no longer available.
    child.kill(signal)
  }
}

export async function runInitialisationCommand(
  args: ParsedArgs,
  printUsage: () => void,
) {
  const command = args.command ? resolveInitialisationCommand(args.command) : undefined
  const supportsContinue = command?.supportsContinue ?? false
  const supportsTarget = command?.supportsTarget ?? false
  const cacheArtefacts = args.options['cache-artefacts'] === true
  const invalidOptions = Object.keys(args.options).filter(
    key =>
      !(key === 'continue' && supportsContinue) &&
      !(key === 'target' && supportsTarget) &&
      key !== 'cache-artefacts',
  )
  const target = args.options.target

  if (
    !command ||
    args.positionals.length > 0 ||
    invalidOptions.length > 0 ||
    (args.options.continue !== undefined && args.options.continue !== true) ||
    (args.options['cache-artefacts'] !== undefined && !cacheArtefacts) ||
    (target !== undefined &&
      (typeof target !== 'string' ||
        !['local', 'preview', 'production'].includes(target)))
  ) {
    printUsage()
    const acceptedOptions = [
      ...(supportsTarget ? ['`--target local|preview|production`'] : []),
      ...(supportsContinue ? ['`--continue`'] : []),
      '`--cache-artefacts`',
    ]
    const suffix =
      acceptedOptions.length > 0
        ? ` accepts only ${acceptedOptions.join(' and ')}.`
        : ' accepts no options.'
    throw new Error(`\`${args.command}\`${suffix}`)
  }

  let summaryDirectory: string | undefined
  let summaryPath = process.env.SAANSEOI_INIT_SUMMARY_PATH
  if (!summaryPath) {
    summaryDirectory = await mkdtemp(join(tmpdir(), 'saanseoi-init-'))
    summaryPath = join(summaryDirectory, 'summary.jsonl')
  }
  const child = Bun.spawn({
    cmd: [
      'fish',
      resolve(REPO_ROOT, command.script),
      ...(typeof target === 'string' ? ['--target', target] : []),
      ...(args.options.continue ? ['--continue'] : []),
      ...(cacheArtefacts ? ['--cache-artefacts'] : []),
    ],
    cwd: REPO_ROOT,
    detached: true,
    env: {
      ...process.env,
      SAANSEOI_CACHE_ARTEFACTS: cacheArtefacts ? '1' : '0',
      SAANSEOI_INIT_COMMAND: args.command ?? '',
      SAANSEOI_INIT_SUMMARY_PATH: summaryPath,
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const disposeChildInterrupt = registerInterruptCleanup(signal =>
    interruptInitialisationProcess(child, signal),
  )
  let exitCode: number
  try {
    exitCode = await child.exited
  } finally {
    disposeChildInterrupt()
  }
  if (exitCode !== 0) {
    await recordInitialisationSummaryEvent(
      {
        command: args.command ?? null,
        message: `Initialisation failed with exit code ${exitCode}; see the preceding command output.`,
        releaseCode: null,
        type: 'error',
      },
      summaryPath,
    )
  }

  if (summaryDirectory) {
    try {
      renderInitialisationSummary(
        undefined,
        undefined,
        await readInitialisationSummaryEvents(summaryPath),
      )
    } finally {
      await rm(summaryDirectory, { force: true, recursive: true })
    }
  }

  if (exitCode !== 0) {
    throw new Error(`Initialisation failed with exit code ${exitCode}.`)
  }
}

async function readInitialisationSummaryEvents(path: string) {
  try {
    return parseInitialisationSummaryEvents(await readFile(path, 'utf8'))
  } catch {
    return []
  }
}

export function renderInitialisationSummary(
  publishedBefore: ReadonlySet<string> | undefined,
  publishedAfter: ReadonlySet<string> | undefined,
  events: readonly InitialisationSummaryEvent[],
) {
  note(
    formatInitialisationSummary(publishedBefore, publishedAfter, events),
    'INITIALISATION SUMMARY',
  )
}

export function formatInitialisationSummary(
  publishedBefore: ReadonlySet<string> | undefined,
  publishedAfter: ReadonlySet<string> | undefined,
  events: readonly InitialisationSummaryEvent[],
) {
  const published = new Set(
    publishedBefore && publishedAfter
      ? [...publishedAfter].filter(code => !publishedBefore.has(code))
      : [],
  )
  for (const event of events) {
    if (event.type === 'published-api-release-set') {
      published.add(event.apiReleaseSetCode)
    }
  }

  const errors = new Map<string, string>()
  const commandsWithReleaseErrors = new Set(
    events.flatMap(event =>
      event.type === 'error' && event.releaseCode && event.command
        ? [event.command]
        : [],
    ),
  )
  for (const event of events) {
    if (event.type !== 'error') continue
    if (
      !event.releaseCode &&
      event.command &&
      commandsWithReleaseErrors.has(event.command)
    ) {
      continue
    }
    const subject = event.releaseCode ?? event.command ?? 'initialisation'
    errors.set(subject, event.message)
  }

  return [
    'Published API release sets',
    published.size > 0
      ? [...published]
          .sort()
          .map(code => `  ${code}`)
          .join('\n')
      : '  -',
    '',
    'Initialisation errors',
    errors.size > 0
      ? [...errors.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([releaseCode, message]) => `  ${releaseCode}: ${message}`)
          .join('\n')
      : '  -',
  ].join('\n')
}
