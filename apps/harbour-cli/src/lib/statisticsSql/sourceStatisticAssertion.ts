/** Persist publisher evidence, never the prepared canonical statistic fields. */
export function sourceStatisticAssertion<
  T extends {
    sourceRecordId: string
    rawProperties: unknown
    sourceGeometry: unknown
    sources: unknown
    version: number
    versionHash: string
    releaseId: string
    validFromRelease: string
    validToRelease: string | null
    isCurrent: boolean
    createdAt: string
    updatedAt: string
  },
>(row: T) {
  return {
    sourceRecordId: row.sourceRecordId,
    rawProperties: row.rawProperties,
    sourceGeometry: row.sourceGeometry,
    sources: row.sources,
    version: row.version,
    versionHash: row.versionHash,
    releaseId: row.releaseId,
    validFromRelease: row.validFromRelease,
    validToRelease: row.validToRelease,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
