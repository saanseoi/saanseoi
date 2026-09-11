import { retainSourceProperties } from '@repo/core/pipeline/services/sources/retainedProperties'
import { sourceLocatorFromReferences } from '@repo/core/pipeline/services/sources/sourcePayload'

/** Persist publisher evidence, never the prepared canonical statistic fields. */
export function sourceStatisticAssertion<
  T extends {
    sourceRecordId: string
    properties: unknown
    sourceGeometry: unknown
    sources: unknown
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
    properties: retainSourceProperties(row.properties),
    sourceGeometry: row.sourceGeometry,
    sourceLocator: sourceLocatorFromReferences(row.sources),
    versionHash: row.versionHash,
    releaseId: row.releaseId,
    validFromRelease: row.validFromRelease,
    validToRelease: row.validToRelease,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
