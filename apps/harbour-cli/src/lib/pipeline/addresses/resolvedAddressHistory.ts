import type { Database } from 'bun:sqlite'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay'
import { historyDeletionSql } from '@repo/db'
import type { AlsMembership } from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'

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
            .query('SELECT 1 FROM address2d WHERE snapshotId=? AND id=?')
            .get(input.scopeId, prior.recordId)
        : prior.recordType === 'address2dBuildingNumberLookup'
          ? (() => {
              const [addressId, buildingNumber] = JSON.parse(prior.recordId)
              return current
                .query(
                  'SELECT 1 FROM address2dBuildingNumberLookup WHERE snapshotId=? AND addressId=? AND buildingNumber=?',
                )
                .get(input.scopeId, addressId, buildingNumber)
            })()
          : current
              .query(
                'SELECT 1 FROM address2dI18n WHERE snapshotId=? AND addressId=? AND locale=?',
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
          updatedAt: input.now,
        }),
      )
  }
}

const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  )

/** Source interpretations inherit along snapshot ancestry, with explicit omission evidence. */
export function coalesceAddressSourceResolutions(input: {
  candidates: Candidates
  historyBinding: string
  parentPlan: SnapshotReplayStep[]
  membership: AlsMembership
  snapshotId: string
  resourceReleaseId: string
}) {
  const history = input.candidates[input.historyBinding]!.db
  history.exec(`CREATE TEMP TABLE priorAddressResolutions(sourceRecordId TEXT PRIMARY KEY,sourceVersionHash TEXT NOT NULL,resolutions TEXT NOT NULL,comparison TEXT NOT NULL);
    CREATE TEMP TABLE currentAddressSources(sourceRecordId TEXT PRIMARY KEY,sourceVersionHash TEXT NOT NULL);`)
  try {
    const prior = history.query(
      'INSERT INTO priorAddressResolutions VALUES(?,?,?,?) ON CONFLICT(sourceRecordId) DO UPDATE SET sourceVersionHash=excluded.sourceVersionHash,resolutions=excluded.resolutions,comparison=excluded.comparison',
    )
    for (const step of input.parentPlan)
      for (const shard of step.shards) {
        const db = input.candidates[shard.bindingName]?.db
        if (!db)
          throw new Error(`Missing provenance history shard ${shard.bindingName}.`)
        history.transaction(() => {
          for (const row of db
            .query<
              {
                sourceRecordId: string
                sourceVersionHash: string
                resolutions: string
              },
              [string]
            >(
              'SELECT sourceRecordId,sourceVersionHash,resolutions FROM sourceResolutions WHERE snapshotId=?',
            )
            .iterate(step.snapshotId))
            prior.run(
              row.sourceRecordId,
              row.sourceVersionHash,
              row.resolutions,
              canonicalJson(JSON.parse(row.resolutions)),
            )
        })()
      }
    const currentSource = history.query('INSERT INTO currentAddressSources VALUES(?,?)')
    for (const [name, { db }] of Object.entries(input.candidates)) {
      if (!name.startsWith('DB_SOURCE_')) continue
      history.transaction(() => {
        for (const table of ['hkgovAlsAddresses2d', 'hkgovAlsAddresses3d'])
          for (const row of db
            .query<{ sourceRecordId: string; versionHash: string }, []>(
              `SELECT sourceRecordId,versionHash FROM ${table} WHERE isCurrent=1`,
            )
            .iterate())
            currentSource.run(row.sourceRecordId, row.versionHash)
      })()
    }
    const insert =
      history.query(`INSERT INTO sourceResolutions(scopeId,snapshotId,sourceReleaseId,sourceRecordId,sourceVersionHash,resolutions) VALUES(?,?,?,?,?,?)
      ON CONFLICT(scopeId,sourceReleaseId,sourceRecordId,sourceVersionHash) DO NOTHING`)
    history.transaction(() => {
      for (const source of input.membership.sources) {
        const version = history
          .query<{ sourceVersionHash: string }, [string]>(
            'SELECT sourceVersionHash FROM currentAddressSources WHERE sourceRecordId=?',
          )
          .get(source.id)
        if (!version)
          throw new Error(`Missing current ALS source evidence ${source.id}.`)
        insert.run(
          `snapshot:${input.snapshotId}`,
          input.snapshotId,
          input.resourceReleaseId,
          source.id,
          version.sourceVersionHash,
          JSON.stringify({
            entities: source.canonicalIds.length
              ? { address2d: source.canonicalIds }
              : {},
          }),
        )
      }
      for (const omitted of history
        .query<{ sourceRecordId: string; sourceVersionHash: string }, []>(
          'SELECT p.sourceRecordId,p.sourceVersionHash FROM priorAddressResolutions p WHERE NOT EXISTS(SELECT 1 FROM currentAddressSources c WHERE c.sourceRecordId=p.sourceRecordId)',
        )
        .iterate())
        insert.run(
          `snapshot:${input.snapshotId}`,
          input.snapshotId,
          input.resourceReleaseId,
          omitted.sourceRecordId,
          omitted.sourceVersionHash,
          JSON.stringify({ entities: {}, decisions: [{ type: 'source_omission' }] }),
        )
      const remove = history.query(
        'DELETE FROM sourceResolutions WHERE scopeId=? AND sourceReleaseId=? AND sourceRecordId=? AND sourceVersionHash=?',
      )
      for (const row of history
        .query<
          {
            sourceRecordId: string
            sourceVersionHash: string
            resolutions: string
            comparison: string
          },
          [string]
        >(
          `SELECT c.sourceRecordId,c.sourceVersionHash,c.resolutions,p.comparison FROM sourceResolutions c JOIN priorAddressResolutions p
         ON c.sourceRecordId=p.sourceRecordId AND c.sourceVersionHash=p.sourceVersionHash WHERE c.snapshotId=?`,
        )
        .iterate(input.snapshotId))
        if (canonicalJson(JSON.parse(row.resolutions)) === row.comparison)
          remove.run(
            `snapshot:${input.snapshotId}`,
            input.resourceReleaseId,
            row.sourceRecordId,
            row.sourceVersionHash,
          )
    })()
  } finally {
    history.exec(
      'DROP TABLE IF EXISTS temp.priorAddressResolutions; DROP TABLE IF EXISTS temp.currentAddressSources;',
    )
  }
}
