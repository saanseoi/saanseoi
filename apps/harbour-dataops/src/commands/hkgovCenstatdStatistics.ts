import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import {
  CENSTATD_STATISTIC_PROFILES,
  prepareHkgovCenstatdStatisticGeographyUploads,
  prepareHkgovCenstatdStatisticUpload,
  type CenstatdStatisticDatasetCode,
} from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdStatistics.ts'
import {
  hkgovCenstatdDistrictLayerName,
  prepareHkgovCenstatdDistrictUpload,
} from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatd.ts'
import { parseHkgovCenstatdDistrictGml } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdGml.ts'
import { ensurePreparedCsdiSourceArchive } from '../../../harbour-cli/src/lib/sources/sourceArchives.ts'
import { loadDatasetFixtures } from '../../../harbour-cli/src/lib/sources/sourceUpdates.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import {
  fetchReleaseReport,
  type ReleaseReportRow,
} from '../../../harbour-cli/src/lib/api/reporting.ts'
import { assertSourceArchiveHash, isSha256 } from '../lib/sourceArchive.ts'
import { unzipSelected } from '../lib/zip.ts'

type StatisticResourceType = 'division' | 'divisionArea' | 'divisionStatistic'

export function pendingCenstatdStatisticResourceTypes(
  rows: readonly Pick<ReleaseReportRow, 'sourceVersion' | 'status' | 'type'>[],
  sourceVersion: string,
  expectedTypes: readonly StatisticResourceType[],
) {
  const publishedTypes = new Set(
    rows
      .filter(row => row.sourceVersion === sourceVersion && row.status === 'published')
      .map(row => row.type),
  )

  return expectedTypes.filter(type => !publishedTypes.has(type))
}

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
  const geographyOnly = args.options['geography-only'] === true
  const deferApiReleaseSet = args.options['defer-api-release-set'] === true
  const forceUpload = args.options['force-upload'] === true
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
  const sourcePath = resolve(input)
  const bytes = await readFile(sourcePath)
  assertSourceArchiveHash(bytes, sha, 'Prepared CSDI archive')
  await ensurePreparedCsdiSourceArchive(target, {
    expected: {
      datasetCode,
      objectKey: key,
      sha256: sha,
    },
    sourcePath,
  })
  const inputGml = Object.fromEntries(
    Object.entries(unzipSelected(bytes, entry => entry.name.endsWith('.gml'))).map(
      ([name, content]) => [name, new TextDecoder().decode(content)],
    ),
  )
  const [datasetFixture] = await loadDatasetFixtures(new Set([datasetCode]))
  const referencePeriods = datasetFixture?.releases?.find(
    release => release.sourceVersion === sourceVersion,
  )?.referencePeriods
  const workDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-statistics-'))
  try {
    const inputFiles = Object.fromEntries(
      Object.entries(inputGml).map(([name]) => [name, join(workDir, name)]),
    )
    await Promise.all(
      Object.entries(inputGml).map(async ([name, content]) => {
        await Bun.write(join(workDir, name), content)
      }),
    )
    const geographyDivisionPath = join(
      workDir,
      'hkgov-censtatd-geography-division.parquet',
    )
    const geographyAreaPath = join(
      workDir,
      'hkgov-censtatd-geography-division-area.parquet',
    )
    const districtDataset = isCenstatdDistrictGeometryDataset(datasetCode)
      ? datasetCode
      : null
    const geographies =
      districtDataset && referencePeriods?.materialiseAreaCompanions
        ? await prepareAnnualDistrictGeographies({
            datasetCode: districtDataset,
            gmlPath:
              inputFiles[
                `${hkgovCenstatdDistrictLayerName(
                  districtDataset,
                  sourceVersion as Parameters<typeof hkgovCenstatdDistrictLayerName>[1],
                )}.gml`
              ] ??
              (() => {
                throw new Error(
                  'CSDI archive has no configured district geometry layer.',
                )
              })(),
            layerName: hkgovCenstatdDistrictLayerName(
              districtDataset,
              sourceVersion as Parameters<typeof hkgovCenstatdDistrictLayerName>[1],
            ),
            referencePeriodField: referencePeriods.sourceField,
            sourceArchive: { key, sha256: sha },
            sourceVersion: sourceVersion as Parameters<
              typeof prepareHkgovCenstatdDistrictUpload
            >[2],
            workDir,
          })
        : [
            districtDataset
              ? await prepareHkgovCenstatdDistrictUpload(
                  inputFiles[
                    `${hkgovCenstatdDistrictLayerName(
                      districtDataset,
                      sourceVersion as Parameters<
                        typeof hkgovCenstatdDistrictLayerName
                      >[1],
                    )}.gml`
                  ] ??
                    (() => {
                      throw new Error(`CSDI archive has no district geometry layer.`)
                    })(),
                  workDir,
                  sourceVersion as Parameters<
                    typeof prepareHkgovCenstatdDistrictUpload
                  >[2],
                  {
                    cohortKey: sourceVersion.slice(0, 4),
                    datasetCode: districtDataset,
                    sourceArchive: { key, sha256: sha },
                  },
                ).then(prepared => ({
                  areaCount: 18,
                  areaOutputFile: prepared.filePath,
                  cohortKey: prepared.cohortKey,
                  divisionCount: 0,
                  divisionOutputFile: null,
                  sourceFeatureCount: 18,
                }))
              : await prepareHkgovCenstatdStatisticGeographyUploads({
                  areaOutputFile: geographyAreaPath,
                  datasetCode: datasetCode as CenstatdStatisticDatasetCode,
                  divisionOutputFile: geographyDivisionPath,
                  inputGml,
                  sourceArchiveKey: key,
                  sourceArchiveSha256: sha,
                  sourceVersion,
                }).then(prepared => ({
                  ...prepared,
                  cohortKey: sourceVersion,
                  areaOutputFile: geographyAreaPath,
                  divisionOutputFile: geographyDivisionPath,
                })),
          ]
    const requestedTypes: StatisticResourceType[] = [
      ...(!geographyOnly ? (['divisionStatistic'] as const) : []),
      ...(!geographyOnly && args.options['defer-stats-release-set'] === true
        ? []
        : geographies.some(geography => geography.divisionCount > 0)
          ? (['division'] as const)
          : []),
      ...(!geographyOnly && args.options['defer-stats-release-set'] === true
        ? []
        : geographies.some(geography => geography.areaCount > 0)
          ? (['divisionArea'] as const)
          : []),
    ]
    const releaseReport = forceUpload
      ? null
      : await fetchReleaseReport(target, { datasetCode, limit: 100 })
    const pendingTypes = forceUpload
      ? requestedTypes
      : pendingCenstatdStatisticResourceTypes(
          releaseReport?.rows ?? [],
          sourceVersion,
          requestedTypes,
        )

    if (pendingTypes.length === 0) {
      console.log(
        `Skipping ${datasetCode} ${sourceVersion}: every requested resource is already published. Use --force-upload for a deliberate reprocess.`,
      )
      return
    }

    if (!geographyOnly && !pendingTypes.includes('divisionStatistic')) {
      console.log(
        `Skipping published Statistics resource for ${datasetCode} ${sourceVersion}.`,
      )
    } else if (!geographyOnly) {
      const parquetPath = join(workDir, 'hkgov-censtatd-statistics.parquet')
      await prepareHkgovCenstatdStatisticUpload({
        datasetCode: datasetCode as CenstatdStatisticDatasetCode,
        inputFiles,
        outputFile: parquetPath,
        sourceArchiveKey: key,
        sourceArchiveSha256: sha,
        sourceVersion,
      })
      await runUploadCommand(
        {
          command: 'upload',
          positionals: [parquetPath],
          options: {
            'cohort-key': sourceVersion,
            'dataset-code': datasetCode,
            region: 'hk',
            'release-notes-url': releaseNotesUrl,
            source: 'hkgov-censtatd',
            'source-archive-key': key,
            'source-archive-sha256': sha,
            'source-version': sourceVersion,
            'geometry-status': referencePeriods?.geometryStatus ?? 'authoritative',
            theme: 'stats',
            type: 'divisionStatistic',
            // Preserve the caller's explicit automation choice. New publisher
            // measures must be reviewed interactively before their canonical
            // metadata is admitted, so this command cannot force --yes.
            yes: Boolean(args.options.yes),
          },
        },
        target,
        {
          allowReprocessPublished: true,
          deferStatsReleaseSet: args.options['defer-stats-release-set'] === true,
          dryRun: false,
          forceUpload: true,
          invocationCwd: resolve(import.meta.dir, '../../../..'),
          printUsage: () => undefined,
          skipConfirm: Boolean(args.options.yes),
          skipSnapshotCleanup: false,
          validateGeometry: false,
        },
      )
    }

    // Launch bootstrap prepares all Statistics snapshots before publishing a
    // cohort-complete initial release set. HMA/area companion geometry belongs to the Divisions
    // family and may depend on Division inputs that are deliberately outside
    // that Stats-only batch. Do not let that optional fan-out invalidate the
    // successfully published Statistics source release.
    if (!geographyOnly && args.options['defer-stats-release-set'] === true) return

    for (const geography of geographies) {
      for (const [filePath, type] of [
        ...(geography.divisionCount > 0 && geography.divisionOutputFile
          ? ([[geography.divisionOutputFile, 'division']] as const)
          : []),
        ...(geography.areaCount > 0
          ? ([[geography.areaOutputFile, 'divisionArea']] as const)
          : []),
      ] as const) {
        if (!pendingTypes.includes(type)) {
          console.log(
            `Skipping published ${type} resource for ${datasetCode} ${sourceVersion}.`,
          )
          continue
        }
        await runUploadCommand(
          {
            command: 'upload',
            positionals: [filePath],
            options: {
              'cohort-key': geography.cohortKey,
              'dataset-code': datasetCode,
              region: 'hk',
              'release-notes-url': releaseNotesUrl,
              source: 'hkgov-censtatd',
              'source-archive-key': key,
              'source-archive-sha256': sha,
              'source-version': sourceVersion,
              'geometry-status': referencePeriods?.geometryStatus ?? 'authoritative',
              theme: 'divisions',
              type,
              yes: true,
            },
          },
          target,
          {
            allowReprocessPublished: true,
            deferApiReleaseSet,
            dryRun: false,
            forceUpload: true,
            invocationCwd: resolve(import.meta.dir, '../../../..'),
            printUsage: () => undefined,
            skipConfirm: true,
            // The area pass resolves the canonical division snapshot created
            // immediately before it; normal cleanup resumes after publication.
            skipSnapshotCleanup: type === 'division',
            validateGeometry: type === 'divisionArea',
          },
        )
      }
    }
  } finally {
    await rm(workDir, { force: true, recursive: true })
  }
}

async function prepareAnnualDistrictGeographies(input: {
  datasetCode: Parameters<typeof hkgovCenstatdDistrictLayerName>[0]
  gmlPath: string
  layerName: string
  referencePeriodField: string
  sourceArchive: { key: string; sha256: string }
  sourceVersion: Parameters<typeof prepareHkgovCenstatdDistrictUpload>[2]
  workDir: string
}) {
  const gml = await readFile(input.gmlPath, 'utf8')
  const years = [
    ...new Set(
      parseHkgovCenstatdDistrictGml(gml, input.layerName)
        .map(feature =>
          String(feature.properties[input.referencePeriodField] ?? '').trim(),
        )
        .filter(year => /^20\d{2}$/.test(year)),
    ),
  ].sort()
  if (years.length === 0) {
    throw new Error(
      `${input.layerName}.gml has no publisher-labelled ${input.referencePeriodField} values.`,
    )
  }
  return Promise.all(
    years.map(async cohortKey => {
      const prepared = await prepareHkgovCenstatdDistrictUpload(
        input.gmlPath,
        input.workDir,
        input.sourceVersion,
        {
          cohortKey,
          datasetCode: input.datasetCode,
          sourceArchive: input.sourceArchive,
        },
      )
      return {
        areaCount: 18,
        areaOutputFile: prepared.filePath,
        cohortKey,
        divisionCount: 0,
        divisionOutputFile: null,
        sourceFeatureCount: 18,
      }
    }),
  )
}

export function isCenstatdDistrictGeometryDataset(
  datasetCode: string,
): datasetCode is
  | 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district'
  | 'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
  | 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district' {
  return (
    datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district' ||
    datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district' ||
    datasetCode === 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'
  )
}
