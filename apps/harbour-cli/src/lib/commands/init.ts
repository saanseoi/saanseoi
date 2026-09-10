import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { styleText } from 'node:util'

import { note, outro } from '@clack/prompts'
import { and, eq, inArray, metaSchema, type MetaDatabase } from '@repo/db'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils'
import { formatField, formatMutedValue } from '../cli/display.ts'
import { formatUpdateGridRow } from './updateFormatting.ts'
import { datasetName, loadDatasetFixtures } from '../sources/sourceUpdates.ts'
import { withLocalMetaDb, withRemoteCachedMetaDb } from '../dbCache/localDbCache.ts'

import { registerInterruptCleanup } from '../cli/interrupt.ts'
import { resolveInitialisationCommand } from '../cli/initialisationCommands.ts'
import {
  finishInitialisationGuide,
  initialisationIndent,
} from '../cli/initialisationIndent.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  parseInitialisationSummaryEvents,
  recordInitialisationSummaryEvent,
  type InitialisationSummaryEvent,
} from './initialisationSummary.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../')

export { resolveInitialisationCommand } from '../cli/initialisationCommands.ts'
export type { InitialisationCommand } from '../cli/initialisationCommands.ts'

/** Render skipped initialisation datasets through the standard source grid. */
export async function formatInitialisationSkippedDatasets(
  target: UploadTarget,
  input: { datasetCodes: readonly string[]; releaseCodes: readonly string[] },
) {
  const datasetCodes = new Set(input.datasetCodes)
  if (input.releaseCodes.length > 0) {
    const readDatasetCodes = async (metaDb: MetaDatabase) => {
      for (const codes of chunkArray(
        [...new Set(input.releaseCodes)],
        getMaxItemsPerInClause(1, 1),
      )) {
        const rows = await metaDb
          .select({ datasetCode: metaSchema.metaDatasets.code })
          .from(metaSchema.metaReleases)
          .innerJoin(
            metaSchema.metaDatasets,
            eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
          )
          .where(
            and(
              inArray(metaSchema.metaReleases.code, codes),
              inArray(metaSchema.metaReleases.status, ['published', 'superseded']),
            ),
          )
          .all()
        for (const row of rows) datasetCodes.add(row.datasetCode)
      }
    }
    if (target.remote) await withRemoteCachedMetaDb(target, readDatasetCodes)
    else await withLocalMetaDb(readDatasetCodes)
  }

  const datasets = await loadDatasetFixtures(datasetCodes)
  return datasets.map(dataset => {
    const sourceVariant = `${dataset.publisherCode}-${datasetName(dataset)
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '')}`
    return `\u001b[36m◆\u001b[39m  ${formatUpdateGridRow(
      { ...dataset, sourceVariant },
      'SKIPPED: no updates',
    )}`
  })
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
  const cacheArtefacts = args.options['no-cache-artefacts'] !== true
  const invalidOptions = Object.keys(args.options).filter(
    key =>
      !(key === 'continue' && supportsContinue) &&
      !(key === 'target' && supportsTarget) &&
      key !== 'skip-curation-checks' &&
      key !== 'no-cache-artefacts',
  )
  const target = args.options.target

  if (
    args.command === 'init:minimal' &&
    (target === undefined || args.options['skip-curation-checks'] !== undefined)
  ) {
    throw new Error(
      '`init:minimal` requires an explicit --target and retains curation checks.',
    )
  }

  if (
    !command ||
    args.positionals.length > 0 ||
    invalidOptions.length > 0 ||
    (args.options['skip-curation-checks'] !== undefined &&
      args.options['skip-curation-checks'] !== true) ||
    (args.options.continue !== undefined && args.options.continue !== true) ||
    (args.options['no-cache-artefacts'] !== undefined &&
      args.options['no-cache-artefacts'] !== true) ||
    (target !== undefined &&
      (typeof target !== 'string' ||
        !['local', 'preview', 'production'].includes(target)))
  ) {
    printUsage()
    const acceptedOptions = [
      ...(supportsTarget ? ['`--target local|preview|production`'] : []),
      ...(supportsContinue ? ['`--continue`'] : []),
      '`--no-cache-artefacts`',
      '`--skip-curation-checks`',
    ]
    const suffix =
      acceptedOptions.length > 0
        ? ` accepts only ${acceptedOptions.join(' and ')}.`
        : ' accepts no options.'
    throw new Error(`\`${args.command}\`${suffix}`)
  }

  const targetLabel =
    args.command === 'init:production'
      ? 'production'
      : typeof target === 'string'
        ? target
        : 'local'
  note(
    [
      formatField('command', args.command ?? 'init'),
      formatField('target', targetLabel),
      formatField('artefact cache', cacheArtefacts ? 'retain' : 'discard after upload'),
    ].join('\n'),
    'INITIALISATION',
  )
  process.stdout.write(
    initialisationIndent(
      args.command ?? undefined,
      process.env.SAANSEOI_INIT_GUIDES,
    ) === 0
      ? `${formatMutedValue('│')}\n`
      : '\n',
  )

  let summaryDirectory: string | undefined
  let summaryPath = process.env.SAANSEOI_INIT_SUMMARY_PATH
  if (!summaryPath) {
    summaryDirectory = await mkdtemp(join(tmpdir(), 'saanseoi-init-'))
    summaryPath = join(summaryDirectory, 'summary.jsonl')
  }
  const eventsBefore = await readInitialisationSummaryEvents(summaryPath)
  const child = Bun.spawn({
    cmd: [
      'fish',
      resolve(REPO_ROOT, command.script),
      ...(typeof target === 'string' ? ['--target', target] : []),
      ...(args.options.continue ? ['--continue'] : []),
      ...(args.options['skip-curation-checks'] ? ['--skip-curation-checks'] : []),
      ...(!cacheArtefacts ? ['--no-cache-artefacts'] : []),
    ],
    cwd: REPO_ROOT,
    detached: true,
    env: {
      ...process.env,
      SAANSEOI_CACHE_ARTEFACTS: cacheArtefacts ? '1' : '0',
      SAANSEOI_INIT_COMMAND: args.command ?? '',
      SAANSEOI_INIT_RELEASE_COLUMN_WIDTH:
        process.env.SAANSEOI_INIT_RELEASE_COLUMN_WIDTH ?? '100',
      SAANSEOI_INIT_GUIDES: [
        process.env.SAANSEOI_INIT_GUIDES,
        String(
          initialisationIndent(
            args.command ?? undefined,
            process.env.SAANSEOI_INIT_GUIDES,
          ),
        ),
      ]
        .filter(value => value !== undefined && value !== '')
        .join(','),
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
  const childEvents = (await readInitialisationSummaryEvents(summaryPath)).slice(
    eventsBefore.length,
  )
  if (exitCode !== 0 && !childEvents.some(event => event.type === 'error')) {
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

  outro(
    `${args.command} ${styleText('blue', 'complete')} ${formatMutedValue(`@ ${targetLabel}`)}`,
  )
  finishInitialisationGuide()
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
