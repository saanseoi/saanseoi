import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ParsedArgs } from '../cli/options.ts'
import type { PreviewMode, RegionCode, TilesOperation } from './tilesTypes.ts'
import { REGIONS, REPO_ROOT } from './tilesConfig.ts'
import { today } from './tilesExecution.ts'

export function resolveTilesInput(
  args: ParsedArgs,
  printUsage: () => void,
  operation: TilesOperation,
) {
  const rawRegion =
    typeof args.options.region === 'string' ? args.options.region : 'gba'
  const regionDefinition = REGIONS[rawRegion as RegionCode]
  const rawDate = typeof args.options.date === 'string' ? args.options.date : undefined
  const rawFile = typeof args.options.file === 'string' ? args.options.file : undefined
  const rawBoundary =
    typeof args.options.boundary === 'string' ? args.options.boundary : undefined
  const version = operation === 'import' ? rawDate : today()
  const allowedOptions =
    operation === 'import'
      ? ['region', 'date', 'file', 'boundary', 'dry-run']
      : ['region', 'dry-run', 'force']
  const invalid =
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => !allowedOptions.includes(key))

  if (
    !regionDefinition ||
    !version ||
    !/^\d{4}-\d{2}-\d{2}$/.test(version) ||
    (operation === 'import' && !rawFile) ||
    (operation === 'import' && !rawBoundary) ||
    invalid
  ) {
    printUsage()
    throw new Error(
      operation === 'import'
        ? 'tiles:import requires --region, --date YYYY-MM-DD, --file PATH, and --boundary PATH.'
        : 'tiles:refresh accepts only --region gba|hk|mo, --dry-run, and --force.',
    )
  }

  let file: string | undefined
  let boundaryFile: string | undefined
  if (operation === 'import') {
    if (!rawFile) throw new Error('tiles:import requires --file PATH.')
    file = resolve(process.env.SAANSEOI_INVOCATION_CWD ?? REPO_ROOT, rawFile)
    if (!rawBoundary) throw new Error('tiles:import requires --boundary PATH.')
    boundaryFile = resolve(
      process.env.SAANSEOI_INVOCATION_CWD ?? REPO_ROOT,
      rawBoundary,
    )
  }
  if (file && !existsSync(file)) throw new Error(`Tileset file not found: ${file}`)
  if (boundaryFile && !existsSync(boundaryFile))
    throw new Error(`Boundary file not found: ${boundaryFile}`)

  return {
    region: { code: rawRegion as RegionCode, ...regionDefinition },
    version,
    file,
    boundaryFile,
    operation,
    dryRun: Boolean(args.options['dry-run']),
    force: operation === 'refresh' && Boolean(args.options.force),
  }
}

/** Resolve either an all-history rewrite or an explicit all-region date rebuild. */
export function resolveTilesRebuildInput(args: ParsedArgs, printUsage: () => void) {
  const rawDate = typeof args.options.date === 'string' ? args.options.date : undefined
  const rawRegion =
    typeof args.options.region === 'string' ? args.options.region : undefined
  const region = rawRegion
    ? REGIONS[rawRegion as RegionCode]
      ? (rawRegion as RegionCode)
      : undefined
    : undefined
  const dateRebuild = rawDate !== undefined
  const invalid =
    args.positionals.length > 0 ||
    (!dateRebuild && args.options.all !== true) ||
    (dateRebuild && args.options.all !== true && !region) ||
    (dateRebuild && args.options.all === true && region !== undefined) ||
    (rawRegion !== undefined && !region) ||
    Object.keys(args.options).some(
      key =>
        ![
          'all',
          'date',
          'dry-run',
          'promote-latest',
          'region',
          'rewrite-history',
        ].includes(key),
    )
  if (
    invalid ||
    (dateRebuild && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) ||
    (!dateRebuild && args.options['promote-latest'] === true)
  ) {
    printUsage()
    throw new Error(
      'tiles:rebuild requires --all, or --region gba|hk|mo with --date YYYY-MM-DD; use --promote-latest only for a single-date promotion.',
    )
  }
  return {
    region,
    version: rawDate,
    dryRun: Boolean(args.options['dry-run']),
    promoteLatest: Boolean(args.options['promote-latest']),
    rewriteHistory: Boolean(args.options['rewrite-history']),
  }
}

export function resolveTilesRetractInput(args: ParsedArgs, printUsage: () => void) {
  const rawRegion =
    typeof args.options.region === 'string' ? args.options.region : undefined
  const rawDate = typeof args.options.date === 'string' ? args.options.date : undefined
  const regionDefinition = rawRegion ? REGIONS[rawRegion as RegionCode] : undefined
  const invalid =
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => !['region', 'date', 'dry-run'].includes(key))
  if (
    !rawRegion ||
    !regionDefinition ||
    !rawDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ||
    invalid
  ) {
    printUsage()
    throw new Error('tiles:retract requires --region gba|hk|mo and --date YYYY-MM-DD.')
  }
  return {
    region: { code: rawRegion as RegionCode, ...regionDefinition },
    version: rawDate,
    dryRun: Boolean(args.options['dry-run']),
  }
}

export function resolveTilesRenderInput(args: ParsedArgs, printUsage: () => void) {
  const rawRegion =
    typeof args.options.region === 'string' ? args.options.region : undefined
  const version = typeof args.options.date === 'string' ? args.options.date : undefined
  const rawMode = typeof args.options.mode === 'string' ? args.options.mode : undefined
  const regionDefinition = rawRegion ? REGIONS[rawRegion as RegionCode] : undefined
  const mode =
    rawMode === 'light' ||
    rawMode === 'dark' ||
    rawMode === 'postcard' ||
    rawMode === 'postcard-lit'
      ? rawMode
      : undefined
  const invalid =
    args.positionals.length > 0 ||
    Object.keys(args.options).some(
      key => !['region', 'date', 'mode', 'dry-run'].includes(key),
    ) ||
    (rawMode !== undefined && !mode)
  if (
    !rawRegion ||
    !regionDefinition ||
    !version ||
    !/^\d{4}-\d{2}-\d{2}$/.test(version) ||
    invalid
  ) {
    printUsage()
    throw new Error(
      'tiles:render requires --region gba|hk|mo and --date YYYY-MM-DD; --mode accepts light, dark, postcard, or postcard-lit.',
    )
  }
  const modes: PreviewMode[] = mode
    ? [mode]
    : ['light', 'dark', 'postcard', 'postcard-lit']
  return {
    region: { code: rawRegion as RegionCode, ...regionDefinition },
    version,
    modes,
    dryRun: Boolean(args.options['dry-run']),
  }
}
