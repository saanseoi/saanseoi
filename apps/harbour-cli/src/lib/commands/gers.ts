import { resolve } from 'node:path'

import type { ParsedArgs } from '../cli/options.ts'
import {
  cacheOvertureGersRegistry,
  formatOvertureGersCoverage,
} from '../sources/gersRegistry.ts'

export async function runCacheGersCommand(args: ParsedArgs, printUsage: () => void) {
  const allowedOptions = new Set([
    'cache-file',
    'refresh',
    'require-gers',
    'source-root',
  ])
  const sourceRootOption = args.options['source-root']
  const cacheFileOption = args.options['cache-file']
  const refresh = args.options.refresh === true
  const requireGers = args.options['require-gers'] === true

  if (
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => !allowedOptions.has(key)) ||
    (sourceRootOption !== undefined && typeof sourceRootOption !== 'string') ||
    (cacheFileOption !== undefined && typeof cacheFileOption !== 'string') ||
    (args.options.refresh !== undefined && !refresh) ||
    (args.options['require-gers'] !== undefined && !requireGers)
  ) {
    printUsage()
    throw new Error(
      '`cache:gers` accepts optional `--source-root PATH`, `--cache-file PATH`, `--refresh`, and `--require-gers`.',
    )
  }

  const invocationCwd = process.env.SAANSEOI_INVOCATION_CWD ?? process.cwd()
  const result = await cacheOvertureGersRegistry({
    cachePath:
      typeof cacheFileOption === 'string'
        ? resolve(invocationCwd, cacheFileOption)
        : undefined,
    onProgress: message => process.stderr.write(`${message}\n`),
    refresh,
    sourceRoot:
      typeof sourceRootOption === 'string'
        ? resolve(invocationCwd, sourceRootOption)
        : undefined,
  })

  console.log(`GERS Registry cache: ${result.cachePath}`)
  console.log(`Source files: ${result.sourceFiles}`)
  console.log(`Registry lookups: ${result.fetchedIds}`)
  for (const row of formatOvertureGersCoverage(result.coverage)) {
    console.log(
      `${row.sourceType}: ${row.gersIds}/${row.totalIds} GERS-backed (${row.coverage}); ${row.nonGersIds} unmatched`,
    )
  }

  if (result.unmatchedIds.length > 0) {
    const preview = result.unmatchedIds.slice(0, 20)
    console.error(
      `Unmatched IDs (${result.unmatchedIds.length}): ${preview.join(', ')}`,
    )
    if (result.unmatchedIds.length > preview.length) {
      console.error(`... and ${result.unmatchedIds.length - preview.length} more.`)
    }
  }

  if (requireGers && result.unmatchedIds.length > 0) {
    throw new Error(
      `GERS Registry validation failed: ${result.unmatchedIds.length} Overture IDs are not registry-backed.`,
    )
  }
}
