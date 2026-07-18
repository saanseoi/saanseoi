import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { note, outro } from '@clack/prompts'

import { inferSourceVersionFromPath } from '@repo/core/uploadLocal'

import { formatField } from '../display.ts'
import { prepareHkgovAlsAddressParquet } from '../hkgovAls.ts'
import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import type { ParsedArgs, UploadTarget } from '../options.ts'

export async function runHkgovAlsPrepCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const sourceDir = args.positionals[0]
  const sourceVersion =
    typeof args.options['source-version'] === 'string'
      ? args.options['source-version']
      : (inferSourceVersionFromPath(sourceDir ?? '') ??
        inferAlsSourceVersionFromPath(sourceDir ?? ''))
  const overtureRelease =
    typeof args.options['overture-release'] === 'string'
      ? args.options['overture-release']
      : undefined
  const cohortKey =
    typeof args.options['cohort-key'] === 'string'
      ? args.options['cohort-key']
      : overtureRelease
        ? inferOvertureCohortKey(overtureRelease)
        : undefined

  if (!sourceDir || !sourceVersion || !cohortKey) {
    printUsage()
    throw new Error(
      'Invalid arguments for `prep-hkgov-dpo`. Pass <source-dir> plus --overture-release or --cohort-key; include --source-version only when it cannot be inferred from the path.',
    )
  }
  const outputFile = await createHkgovAlsTempOutputFile(sourceVersion)

  const explicitDbPath =
    typeof args.options.db === 'string' ? args.options.db : undefined
  const dbContext = explicitDbPath
    ? null
    : await resolveLocalAddressDbContext(target, 'hk', cohortKey.slice(0, 4), {
        cacheTableProfile: 'address',
      })
  const result = await prepareHkgovAlsAddressParquet({
    dbPath: explicitDbPath,
    bridgeOutputFile:
      typeof args.options['bridge-out'] === 'string'
        ? args.options['bridge-out']
        : undefined,
    currentDb: dbContext?.currentDb,
    environment: target.environment,
    identityBridgeFile:
      typeof args.options['identity-bridge'] === 'string'
        ? args.options['identity-bridge']
        : undefined,
    matchReportFile:
      typeof args.options['match-report'] === 'string'
        ? args.options['match-report']
        : undefined,
    metaDb: dbContext?.metaDb,
    overtureRelease,
    outputFile,
    cohortKey,
    sourceDir,
    sourceVersion,
  }).finally(() => dbContext?.cleanup())

  if (result.sourceDuplicateFeatureGroups.length > 0) {
    note(
      formatSourceDuplicateTable(result.sourceDuplicateFeatureGroups),
      'SOURCE DUPLICATES REMOVED',
    )
  }

  note(
    [
      formatField('outputFile', result.outputFile),
      formatField('sourceFiles', String(result.sourceFileCount)),
      formatField('featureCount', String(result.featureCount)),
      formatField(
        'exactSourceDuplicatesRemoved',
        String(result.deduplicatedFeatureCount),
      ),
      formatField(
        'identityRowsConsolidated',
        String(result.identityConsolidatedFeatureCount),
      ),
      formatField(
        'identityMatches',
        String(
          result.identityStats.matchedByAddressCoordinate +
            result.identityStats.matchedByAddress +
            result.identityStats.bridged,
        ),
      ),
      formatField('identityAmbiguous', String(result.identityStats.ambiguous)),
      formatField('identityProvisional', String(result.identityStats.provisional)),
      ...(result.bridgeOutputFile
        ? [formatField('identityBridge', result.bridgeOutputFile)]
        : []),
      ...(result.matchReportFile
        ? [formatField('matchReport', result.matchReportFile)]
        : []),
    ].join('\n'),
    'PREP RESULT',
  )
  outro('ALS parquet preparation complete')
}

function formatSourceDuplicateTable(
  groups: Array<{
    address: string
    occurrences: Array<{
      featureIndexOneBased: number
      sourceFile: string
    }>
  }>,
) {
  const rows = groups.map((group, index) => [
    String(index + 1),
    group.address.replaceAll('|', '\\|'),
    group.occurrences
      .map(occurrence => `${occurrence.sourceFile} #${occurrence.featureIndexOneBased}`)
      .join(', '),
  ])
  const header = ['Record', 'Address', 'Source feature positions (one-based)']

  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n')
}

export function inferAlsSourceVersionFromPath(value: string) {
  const match = value.match(
    /(?:^|[/\\])(20\d{2})(\d{2})(\d{2})-(\d{4})-ALS-GeoJSON(?:[/\\]|$)/i,
  )
  return match ? `${match[1]}-${match[2]}-${match[3]}.${match[4]}` : null
}

export function inferOvertureCohortKey(value: string) {
  return value.match(/(20\d{2}-\d{2}-\d{2}\.\d+)$/)?.[1] ?? null
}

async function createHkgovAlsTempOutputFile(sourceVersion: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-dpo-'))

  return join(tempDir, `hkgov-hk-${sourceVersion}-address.parquet`)
}
