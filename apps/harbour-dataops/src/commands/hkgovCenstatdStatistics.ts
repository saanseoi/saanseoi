import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import {
  CENSTATD_STATISTIC_PROFILES,
  readHkgovCenstatdStatisticArchive,
  type CenstatdStatisticDatasetCode,
} from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdStatistics.ts'
import { processNativeSourceSqlRelease } from '../../../harbour-cli/src/lib/localPipeline/nativeSourceSql.ts'
import { assertSourceArchiveHash, isSha256 } from '../lib/sourceArchive.ts'
import { unzipSelected } from '../lib/zip.ts'

export async function runHkgovCenstatdStatisticsIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const input = args.positionals[0],
    datasetCode = args.options['dataset-code'],
    sourceVersion = args.options['source-version'],
    releaseNotesUrl = args.options['release-notes-url'],
    key = args.options['source-archive-key'],
    sha = args.options['source-archive-sha256']
  if (
    !input ||
    args.positionals.length !== 1 ||
    typeof datasetCode !== 'string' ||
    !(datasetCode in CENSTATD_STATISTIC_PROFILES) ||
    typeof sourceVersion !== 'string' ||
    typeof releaseNotesUrl !== 'string' ||
    typeof key !== 'string' ||
    !isSha256(sha)
  ) {
    printUsage()
    throw new Error(
      'C&SD statistics ingestion requires <source.zip>, --dataset-code, --source-version, --release-notes-url, --source-archive-key and --source-archive-sha256.',
    )
  }
  const bytes = await readFile(resolve(input))
  assertSourceArchiveHash(bytes, sha, 'Prepared CSDI archive')
  const inputGml = Object.fromEntries(
    Object.entries(unzipSelected(bytes, entry => entry.name.endsWith('.gml'))).map(
      ([name, content]) => [name, new TextDecoder().decode(content)],
    ),
  )
  const rows = readHkgovCenstatdStatisticArchive({
    datasetCode: datasetCode as CenstatdStatisticDatasetCode,
    inputGml,
    sourceVersion,
  })
  await processNativeSourceSqlRelease(target, {
    archiveObjectKey: key,
    archivePath: resolve(input),
    archiveSha256: sha,
    cohortKey: sourceVersion,
    datasetCode,
    releaseNotesUrl,
    rowCount: rows.length,
    source: 'hkgov-censtatd',
    sourceVersion,
    tables: [
      {
        name: 'hkgovCenstatdStatistics',
        provenance: 'required',
        rows: rows.map(row => ({
          datasetCode,
          featureId: row.featureId,
          layerName: row.layerName,
          rawProperties: row.properties,
          referenceYear: sourceVersion,
          sourceGeometry: row.sourceGeometry,
          sourceRecordId: `CENSTATD:${row.layerName}:${row.featureId}`,
          sources: [
            {
              dataset: 'hkgov-censtatd',
              layerName: row.layerName,
              sourceArchiveKey: key,
              sourceArchiveSha256: sha,
            },
          ],
        })),
      },
    ],
    theme: 'stats',
    type: 'divisionStatistic',
  })
}
