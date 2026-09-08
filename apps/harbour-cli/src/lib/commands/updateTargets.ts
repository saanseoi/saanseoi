import { fetchReleaseReport, type ReleaseReportRow } from '../api/reporting.ts'
import type { UploadTarget } from '../cli/options.ts'
import {
  type DatasetFixture,
  normaliseDatasetVersion,
} from '../sources/sourceUpdates.ts'
import type { DatasetUpdate } from './updateTypes.ts'

const TARGET_RELEASE_REPORT_LIMIT = 100

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
  includeGeography = false,
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
  return targetVersionsFromReport(dataset, report.rows, includeGeography)
}

export function targetVersionsFromReport(
  dataset: DatasetFixture,
  rows: ReadonlyArray<
    Pick<ReleaseReportRow, 'sourceVersion' | 'status'> &
      Partial<Pick<ReleaseReportRow, 'type' | 'hasStatisticsSnapshot'>>
  >,
  includeGeography = false,
) {
  if (dataset.theme === 'stats' && includeGeography) {
    const requiredTypes = dataset.resourceTypes ?? ['divisionStatistic']
    const completeVersions = new Set(
      rows
        .filter(row =>
          requiredTypes.every(type =>
            rows.some(
              candidate =>
                candidate.sourceVersion === row.sourceVersion &&
                isPublishedTargetRelease(candidate.status) &&
                candidate.type === type,
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
      row => row.type === 'divisionStatistic' || row.hasStatisticsSnapshot === true,
    )
  const targetVersions = new Map<string, string | null>()
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
  return status === 'published' || status === 'superseded'
}

function versionMatchesSourceRelease(version: string, sourceVersion: string) {
  return version === sourceVersion || version.startsWith(`${sourceVersion}.`)
}

function latestVersion(versions: string[]) {
  return versions
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .at(-1)
}
