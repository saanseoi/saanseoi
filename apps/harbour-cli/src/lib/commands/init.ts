import { resolve } from 'node:path'

import type { ParsedArgs } from '../cli/options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../')

const initialisationCommands = {
  init: {
    script: 'scripts/init/all.fish',
    supportsContinue: true,
    supportsTarget: false,
  },
  'init:addresses:default': {
    script: 'scripts/init/addresses-hkgov-dpo.fish',
    supportsContinue: true,
    supportsTarget: false,
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
    supportsContinue: false,
    supportsTarget: true,
  },
  'init:divisions:overture': {
    script: 'scripts/init/divisions-overture.fish',
    supportsContinue: true,
    supportsTarget: true,
  },
  'init:streets:hkgov-landsd': {
    script: 'scripts/init/streets-hkgov-landsd.fish',
    supportsContinue: false,
    supportsTarget: false,
  },
} as const

export type InitialisationCommand = keyof typeof initialisationCommands

export function resolveInitialisationCommand(command: string) {
  return initialisationCommands[command as InitialisationCommand]
}

export async function runInitialisationCommand(
  args: ParsedArgs,
  printUsage: () => void,
) {
  const command = args.command ? resolveInitialisationCommand(args.command) : undefined
  const supportsContinue = command?.supportsContinue ?? false
  const supportsTarget = command?.supportsTarget ?? false
  const cacheArtefacts =
    args.options.cacheArtefacts === true || args.options['cache-artefacts'] === true
  const invalidOptions = Object.keys(args.options).filter(
    key =>
      !(key === 'continue' && supportsContinue) &&
      !(key === 'target' && supportsTarget) &&
      key !== 'cacheArtefacts' &&
      key !== 'cache-artefacts',
  )
  const target = args.options.target

  if (
    !command ||
    args.positionals.length > 0 ||
    invalidOptions.length > 0 ||
    (args.options.continue !== undefined && args.options.continue !== true) ||
    ((args.options.cacheArtefacts !== undefined ||
      args.options['cache-artefacts'] !== undefined) &&
      !cacheArtefacts) ||
    (target !== undefined &&
      (typeof target !== 'string' ||
        !['local', 'preview', 'production'].includes(target)))
  ) {
    printUsage()
    const acceptedOptions = [
      ...(supportsTarget ? ['`--target local|preview|production`'] : []),
      ...(supportsContinue ? ['`--continue`'] : []),
      '`--cacheArtefacts`',
    ]
    const suffix =
      acceptedOptions.length > 0
        ? ` accepts only ${acceptedOptions.join(' and ')}.`
        : ' accepts no options.'
    throw new Error(`\`${args.command}\`${suffix}`)
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
    env: {
      ...process.env,
      SAANSEOI_CACHE_ARTEFACTS: cacheArtefacts ? '1' : '0',
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await child.exited

  if (exitCode !== 0) {
    throw new Error(`Initialisation failed with exit code ${exitCode}.`)
  }
}
