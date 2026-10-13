import type { Database } from 'bun:sqlite'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay'
import { historyDeletionSql } from '@repo/db'

type Candidates = Record<string, { db: Database }>

/** Close exact superseded versions where they live, without copying earlier shards. */
export function closeResolvedAddressHistory(input: {
  candidates: Candidates
  historyBinding: string
  prior: ResolvedSnapshotVersion[]
  snapshotId: string
  scopeId: string
  resourceReleaseId: string
  now: string
}) {
  const history = input.candidates[input.historyBinding]!.db
  const current = input.candidates.DB_CURRENT!.db
  for (const prior of input.prior) {
    if (
      !['address2d', 'address2dI18n', 'address2dBuildingNumberLookup'].includes(
        prior.recordType,
      )
    )
      continue
    const present =
      prior.recordType === 'address2d'
        ? current
            .query('SELECT 1 FROM address2d WHERE scopeId=? AND id=?')
            .get(input.scopeId, prior.recordId)
        : prior.recordType === 'address2dBuildingNumberLookup'
          ? (() => {
              const [addressId, buildingNumber] = JSON.parse(prior.recordId)
              return current
                .query(
                  'SELECT 1 FROM address2dBuildingNumberLookup WHERE scopeId=? AND addressId=? AND buildingNumber=?',
                )
                .get(input.scopeId, addressId, buildingNumber)
            })()
          : current
              .query(
                'SELECT 1 FROM address2dI18n WHERE scopeId=? AND addressId=? AND locale=?',
              )
              .get(input.scopeId, prior.recordId, prior.locale)
    if (!present)
      history.exec(
        historyDeletionSql({
          snapshotId: input.snapshotId,
          recordType: prior.recordType,
          recordId: prior.recordId,
          locale: prior.locale,
          sourceReleaseId: input.resourceReleaseId,
          createdAt: input.now,
        }),
      )
  }
}
