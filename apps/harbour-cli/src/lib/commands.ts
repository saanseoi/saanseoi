import type { ParsedArgs } from './options.ts'

type UploadCommandAlias = 'upload:local' | 'upload:cf:preview' | 'upload:cf:production'

function resolveUploadTargetAlias(command: UploadCommandAlias) {
  switch (command) {
    case 'upload:local':
      return 'local'
    case 'upload:cf:preview':
      return 'cf-preview'
    case 'upload:cf:production':
      return 'cf-production'
  }
}

/**
 * Normalize binary-friendly command aliases into the canonical command shape
 * expected by the Harbour CLI internals.
 */
export function normalizeCommandArgs(args: ParsedArgs): ParsedArgs {
  switch (args.command) {
    case 'upload:local':
    case 'upload:cf:preview':
    case 'upload:cf:production':
      return {
        ...args,
        command: 'upload',
        options: {
          ...args.options,
          target:
            typeof args.options.target === 'string'
              ? args.options.target
              : resolveUploadTargetAlias(args.command),
        },
      }
    default:
      return args
  }
}
