import { resolve } from 'node:path'

import type { prepareUpload } from '@repo/core/upload-local'

export type ParsedArgs = {
  command: string | null
  positionals: string[]
  options: Record<string, string | boolean>
}

export type CliUploadOptions = Parameters<typeof prepareUpload>[0]
export type UploadEnvironment = 'dev' | 'preview' | 'production'
export type UploadTarget = {
  remote: boolean
  environment: UploadEnvironment
}

/**
 * Parse the Harbour CLI invocation into a command, positional arguments,
 * and `--flag` style options.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const [, , command, ...rest] = argv
  const positionals: string[] = []
  const options: Record<string, string | boolean> = {}

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]

    if (!token) {
      continue
    }

    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }

    const key = token.slice(2)
    const next = rest[index + 1]

    if (!next || next.startsWith('--')) {
      options[key] = true
      continue
    }

    options[key] = next
    index += 1
  }

  return {
    command: command ?? null,
    positionals,
    options,
  }
}

/**
 * Resolve CLI upload flags into the `prepareUpload` input shape.
 */
export function buildRegisterOptions(
  invocationCwd: string,
  inputFile: string,
  args: ParsedArgs,
): CliUploadOptions {
  return {
    filePath: resolve(invocationCwd, inputFile),
    type: typeof args.options.type === 'string' ? args.options.type : undefined,
    theme: typeof args.options.theme === 'string' ? args.options.theme : undefined,
    regionCode:
      typeof args.options.region === 'string' ? args.options.region : undefined,
    snapshotMonth:
      typeof args.options.month === 'string' ? args.options.month : undefined,
    source: typeof args.options.source === 'string' ? args.options.source : undefined,
    sourceVersion:
      typeof args.options['source-version'] === 'string'
        ? args.options['source-version']
        : undefined,
    dryRun: Boolean(args.options['dry-run']),
  }
}

/**
 * Resolve the requested Harbour upload target from `--target`, falling back to
 * `HARBOUR_UPLOAD_TARGET` when omitted.
 */
export function resolveUploadTarget(args: ParsedArgs): UploadTarget {
  const rawTarget =
    typeof args.options.target === 'string'
      ? args.options.target
      : process.env.HARBOUR_UPLOAD_TARGET

  switch (rawTarget) {
    case undefined:
    case 'local':
      return {
        remote: false,
        environment: 'dev',
      }
    case 'cf-preview':
      return {
        remote: true,
        environment: 'preview',
      }
    case 'production':
      return {
        remote: true,
        environment: 'production',
      }
    default:
      throw new Error(
        `Unsupported upload target: ${rawTarget}. Use local, cf-preview, or production.`,
      )
  }
}
