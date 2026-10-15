import {
  fetchReleaseReport,
  fetchProcessingRunReport,
  type ReleaseReportRow,
} from '../api/reporting.ts'
import type { UploadTarget } from '../cli/options.ts'
import {
  type DatasetFixture,
  normaliseDatasetVersion,
} from '../sources/sourceUpdates.ts'
import type { DatasetUpdate } from './updateTypes.ts'

const TARGET_RELEASE_REPORT_LIMIT = 100

/** Bulk geometry assembly has completed delivery evidence before publication. */
export async function verifyDeferredGeometryTarget(
  target: UploadTarget,
  dataset: DatasetFixture,
  update: Pick<DatasetUpdate, 'version'>,
  reads = { releases: fetchReleaseReport, runs: fetchProcessingRunReport },
) {
  if (dataset.theme !== 'stats' || !update.version) return false
  const report = await reads.releases(target, {
    datasetCode: dataset.code,
    limit: TARGET_RELEASE_REPORT_LIMIT,
  })
  if (report.rows.length === TARGET_RELEASE_REPORT_LIMIT)
    throw new Error('Deferred geometry release report may be truncated.')
  const rows = report.rows.filter(
    row => normaliseDatasetVersion(dataset, row.sourceVersion) === update.version,
  )
  const requiredTypes = dataset.resourceTypes ?? ['divisionStatistic']
  if (!requiredTypes.every(type => rows.some(row => row.resourceType === type)))
    return false
  if (
    !rows.some(
      row =>
        row.resourceType === 'divisionStatistic' &&
        isPublishedTargetRelease(row.status),
    )
  )
    return false
  if (
    rows.some(
      row =>
        !isPublishedTargetRelease(row.status) &&
        !(row.resourceType === 'divisionArea' && row.status === 'processing'),
    )
  )
    return false
  const pending = rows.filter(
    row => row.resourceType === 'divisionArea' && row.status === 'processing',
  )
  if (!pending.length) return false
  for (const row of pending) {
    const report = await reads.runs(target, {
      resourceReleaseId: row.resourceReleaseId,
      limit: TARGET_RELEASE_REPORT_LIMIT,
    })
    const latest = report.rows.find(run => run.phase === 'processDataset')
    if (latest?.status !== 'completed' || !latest.finishedAt)
      throw new Error(
        `Deferred geometry ${row.releaseCode} has no completed delivery evidence.`,
      )
  }
  return true
}

/**
 * A native importer exiting successfully is not publication evidence. Confirm
 * the exact release is visible on the upload target before reporting it.
 */
export function requirePublishedTargetVersion(
  update: Pick<DatasetUpdate, 'sourceKey' | 'targetSourceKey' | 'version'>,
  targetVersions: ReadonlyMap<string, string | null>,
) {
  const targetSourceKey = update.targetSourceKey ?? update.sourceKey
  const publishedVersion = targetSourceKey
    ? targetVersions.get(targetSourceKey)
    : undefined

  if (!update.version || publishedVersion !== update.version) {
    throw new Error(
      `Ingestion completed, but ${targetSourceKey ?? 'the source release'} is not published on the target at v${update.version ?? 'unknown'} (target reports ${publishedVersion ? `v${publishedVersion}` : 'no release'}).`,
    )
  }

  return publishedVersion
}

export async function fetchTargetVersions(
  target: UploadTarget,
  dataset: DatasetFixture,
) {
  const report = await fetchReleaseReport(target, {
    datasetCode: dataset.code,
    limit: TARGET_RELEASE_REPORT_LIMIT,
  })
  if (report.rows.length === TARGET_RELEASE_REPORT_LIMIT) {
    throw new Error(
      `Target release report for ${dataset.code} may be truncated at ${TARGET_RELEASE_REPORT_LIMIT} rows.`,
    )
  }
  return targetVersionsFromReport(dataset, report.rows)
}

export function targetVersionsFromReport(
  dataset: DatasetFixture,
  rows: ReadonlyArray<
    Pick<ReleaseReportRow, 'sourceVersion' | 'status'> &
      Partial<Pick<ReleaseReportRow, 'resourceType' | 'hasStatisticsSnapshot'>>
  >,
) {
  const publishedRowsByType = rows.filter(row => isPublishedTargetRelease(row.status))
  if (dataset.theme === 'stats' || (dataset.resourceTypes?.length ?? 0) > 1) {
    const requiredTypes = dataset.resourceTypes ?? ['divisionStatistic']
    const completeVersions = new Set(
      rows
        .filter(row =>
          requiredTypes.every(type =>
            rows.some(
              candidate =>
                candidate.sourceVersion === row.sourceVersion &&
                isPublishedTargetRelease(candidate.status) &&
                candidate.resourceType === type,
            ),
          ),
        )
        .map(row => row.sourceVersion),
    )
    rows = rows.filter(row => completeVersions.has(row.sourceVersion))
  }
  // Geometry from the same publisher cohort does not establish stats readiness.
  if (dataset.theme === 'stats')
    rows = rows.filter(
      row =>
        row.resourceType === 'divisionStatistic' || row.hasStatisticsSnapshot === true,
    )
  const targetVersions = new Map<string, string | null>()
  for (const row of publishedRowsByType) {
    if (row.resourceType) {
      targetVersions.set(
        `${row.sourceVersion}:${row.resourceType}`,
        normaliseDatasetVersion(dataset, row.sourceVersion),
      )
    }
  }
  const releases = dataset.releases?.length ? dataset.releases : [undefined]
  const publishedRows = rows.filter(row => isPublishedTargetRelease(row.status))
  const targetHasNoReleases = publishedRows.length === 0

  // A successful target report is authoritative. Missing manifest cohorts are
  // absent from the target too, even when this operator has saved local state.
  if (targetHasNoReleases) targetVersions.set(dataset.code, null)

  for (const sourceVersion of publishedRows
    .map(row => row.sourceVersion)
    .filter((version): version is string => Boolean(version))) {
    targetVersions.set(sourceVersion, normaliseDatasetVersion(dataset, sourceVersion))
  }

  for (const [index, release] of releases.entries()) {
    const releaseSourceVersion = release?.sourceVersion
    const sourceKey = releaseSourceVersion ?? dataset.code
    const matchingVersions = releaseSourceVersion
      ? rows
          .filter(row => isPublishedTargetRelease(row.status))
          .map(row => row.sourceVersion)
          .filter(version => versionMatchesSourceRelease(version, releaseSourceVersion))
      : publishedRows.map(row => row.sourceVersion)
    const resolvedTargetVersion = latestVersion(matchingVersions)
    const targetVersion = resolvedTargetVersion
      ? normaliseDatasetVersion(dataset, resolvedTargetVersion)
      : null

    targetVersions.set(sourceKey || `release-${index}`, targetVersion)
  }

  return targetVersions
}

function isPublishedTargetRelease(status: string) {
  return status === 'current' || status === 'archived'
}

function versionMatchesSourceRelease(version: string, sourceVersion: string) {
  return version === sourceVersion || version.startsWith(`${sourceVersion}.`)
}

function latestVersion(versions: string[]) {
  return versions
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .at(-1)
}
