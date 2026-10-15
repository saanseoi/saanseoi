import type { DatasetFixture, DatasetUpdate } from './sourceUpdatesTypes.ts'

export function assertSkippedReleases(dataset: DatasetFixture) {
  if (dataset.skippedReleases === undefined) return
  if (!Array.isArray(dataset.skippedReleases)) {
    throw new Error(`Invalid skippedReleases for ${dataset.code}.`)
  }
  const versions = new Set<string>()
  for (const decision of dataset.skippedReleases) {
    if (
      !decision ||
      typeof decision.sourceVersion !== 'string' ||
      !decision.sourceVersion.trim() ||
      decision.sourceVersion !== decision.sourceVersion.trim() ||
      typeof decision.reason !== 'string' ||
      !decision.reason.trim() ||
      versions.has(decision.sourceVersion)
    ) {
      throw new Error(`Invalid or duplicate skipped release for ${dataset.code}.`)
    }
    versions.add(decision.sourceVersion)
  }
}

export function skippedReleaseReason(dataset: DatasetFixture, version?: string) {
  return dataset.skippedReleases?.find(decision => decision.sourceVersion === version)
    ?.reason
}

export function applySkippedRelease(update: DatasetUpdate): DatasetUpdate {
  const reason = skippedReleaseReason(update.dataset, update.version)
  if (!reason) return update
  return {
    ...update,
    status: 'skipped',
    message: reason,
    download: undefined,
    ingest: undefined,
    upload: undefined,
    postArchiveIngest: undefined,
    recordIdenticalArchive: undefined,
  }
}
