import { resolve } from 'node:path'

import type { prepareUpload } from '@repo/core/uploadLocal'

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
  r2?: 'local' | 'preview' | 'production'
}

/**
 * Local processing uses preview shard metadata; remote processing must follow
 * the explicitly selected preview or production environment.
 */
export function resolvePipelineEnvironment(
  target: UploadTarget,
): 'preview' | 'production' {
  return target.remote && target.environment === 'production' ? 'production' : 'preview'
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
    datasetCode:
      typeof args.options['dataset-code'] === 'string'
        ? args.options['dataset-code']
        : undefined,
    filePath: resolve(invocationCwd, inputFile),
    resourceType: typeof args.options.type === 'string' ? args.options.type : undefined,
    theme: typeof args.options.theme === 'string' ? args.options.theme : undefined,
    regionCode:
      typeof args.options.region === 'string' ? args.options.region : undefined,
    cohortKey:
      typeof args.options['cohort-key'] === 'string'
        ? args.options['cohort-key']
        : undefined,
    source: typeof args.options.source === 'string' ? args.options.source : undefined,
    sourceVersion:
      typeof args.options['source-version'] === 'string'
        ? args.options['source-version']
        : undefined,
    geometryStatus:
      args.options['geometry-status'] === 'authoritative' ||
      args.options['geometry-status'] === 'fallback'
        ? args.options['geometry-status']
        : undefined,
    releaseNotesUrl:
      typeof args.options['release-notes-url'] === 'string'
        ? args.options['release-notes-url']
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

  const r2 = args.options.r2 ?? process.env.SAANSEOI_R2_TARGET
  if (r2 !== undefined && !['local', 'preview', 'production'].includes(String(r2)))
    throw new Error('--r2 requires local, preview, or production.')
  if (r2 !== undefined && rawTarget && rawTarget !== 'local' && r2 !== rawTarget)
    throw new Error('An independent --r2 target is supported only with --target local.')
  const storage = r2 === undefined ? {} : { r2: r2 as UploadTarget['r2'] }
  switch (rawTarget) {
    case undefined:
    case 'local':
      return {
        ...storage,
        remote: false,
        environment: 'dev',
      }
    case 'preview':
      return {
        ...storage,
        remote: true,
        environment: 'preview',
      }
    case 'production':
      return {
        ...storage,
        remote: true,
        environment: 'production',
      }
    default:
      throw new Error(
        `Unsupported upload target: ${rawTarget}. Use local, preview, or production.`,
      )
  }
}

export function getStringOption(args: ParsedArgs, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args.options[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}

export function resolveR2Target(
  target: UploadTarget,
): 'local' | 'preview' | 'production' {
  const value = target.r2 ?? process.env.SAANSEOI_R2_TARGET
  if (value !== undefined) {
    if (value !== 'local' && value !== 'preview' && value !== 'production')
      throw new Error('Invalid SAANSEOI_R2_TARGET.')
    if (target.remote && value !== target.environment)
      throw new Error('An independent R2 target requires local D1.')
    return value
  }
  return target.remote && target.environment === 'production'
    ? 'production'
    : target.remote
      ? 'preview'
      : 'local'
}
