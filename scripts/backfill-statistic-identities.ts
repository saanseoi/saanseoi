import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canonicalStatisticId } from '../libs/db/src/canonicalIdentity'
import { statisticContentHash } from '../apps/harbour-cli/src/lib/pipeline/statistics/planCanonicalStatistics'

type RecordRow = Record<string, any>
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Local-only, one-off repair. Existing semantic hashes must match before any update. */
export function backfillStatisticIdentities(
  paths: string[],
  output: string,
  apply = false,
) {
  if (
    !paths.length ||
    paths.length > 8 ||
    new Set(paths.map(p => resolve(p))).size !== paths.length
  )
    throw new Error('Provide 1–8 distinct local SQLite paths.')
  if (existsSync(output)) throw new Error('Recovery directory already exists.')
  const db = new Database(':memory:')
  const changes: Array<{
    database: number
    rowid: number
    oldId: string
    id: string
    oldHash: string | null
    hash: string | null
  }> = []
  const identities = new Map<string, string>()
  const targets = new Map<string, string>()
  const before: number[] = []
  try {
    paths.forEach((path, i) => {
      if (!existsSync(path)) throw new Error(`Missing database: ${path}`)
      db.query(`ATTACH DATABASE ? AS d${i}`).run(resolve(path))
    })
    db.exec(apply ? 'BEGIN IMMEDIATE' : 'BEGIN')
    const rows = paths.map((_, i) => {
      const result = db
        .query(`SELECT rowid AS _rowid, * FROM d${i}.statsRecords`)
        .all() as RecordRow[]
      before.push(result.length)
      return result
    })
    // Build the identity map first so sparse delete events can follow their upserts.
    for (const records of rows)
      for (const row of records) {
        if (row.operation === 'delete') continue
        const geography = JSON.parse(row.geography)
        const input = {
          datasetCode: row.datasetCode,
          referencePeriodCode: row.referencePeriodCode,
          geography,
        }
        const id = canonicalStatisticId(input)
        const basis = JSON.stringify({
          datasetCode: input.datasetCode,
          referencePeriodCode: input.referencePeriodCode,
          geography: {
            kind: geography.kind,
            code: geography.code,
            class: geography.class ?? null,
            namespace: geography.namespace ?? null,
          },
        })
        const oldId = `stats:${createHash('sha256').update(basis).digest('hex')}`
        if (row.id !== oldId && row.id !== id)
          throw new Error(`Unexpected statistic identity: ${row.id}`)
        if (identities.has(row.id) && identities.get(row.id) !== id)
          throw new Error('Conflicting identity mapping')
        if (targets.has(id) && targets.get(id) !== row.id)
          throw new Error('Mixed or colliding identities')
        identities.set(row.id, id)
        targets.set(id, row.id)
      }
    rows.forEach((records, i) => {
      const definitions = new Map(
        (
          db
            .query(`SELECT id, fieldDefinitionHashes FROM d${i}.statsDefinitionSets`)
            .all() as RecordRow[]
        ).map(r => [r.id, JSON.parse(r.fieldDefinitionHashes)]),
      )
      for (const row of records) {
        const id = identities.get(row.id)
        if (!id) throw new Error(`No identity for deletion: ${row.id}`)
        let hash = null
        if (row.operation !== 'delete') {
          const fieldDefinitionHashes = definitions.get(row.definitionSetId)
          if (!fieldDefinitionHashes)
            throw new Error(`Missing definition set: ${row.definitionSetId}`)
          const content = {
            ...row,
            geography: JSON.parse(row.geography),
            values: JSON.parse(row.values),
            fieldDefinitionHashes,
          }
          // The same hash function is used by forward ingestion.
          const oldHash = statisticContentHash(content as any)
          if (oldHash !== row.versionHash)
            throw new Error(`Existing content hash mismatch: ${row.id}`)
          hash = statisticContentHash({ ...content, id } as any)
        } else if (row.versionHash !== null)
          throw new Error('Delete event has content hash')
        if (row.id !== id)
          changes.push({
            database: i,
            rowid: row._rowid,
            oldId: row.id,
            id,
            oldHash: row.versionHash,
            hash,
          })
      }
    })
    mkdirSync(output, { recursive: true })
    writeFileSync(
      `${output}/plan.json`,
      JSON.stringify({ paths: paths.map(p => resolve(p)), before, changes }, null, 2),
    )
    const literal = (value: string | null) => (value === null ? 'NULL' : quote(value))
    writeFileSync(
      `${output}/rollback.sql`,
      [
        ...paths.map((p, i) => `ATTACH DATABASE ${quote(resolve(p))} AS d${i};`),
        'BEGIN IMMEDIATE;',
        ...changes.map(
          c =>
            `UPDATE d${c.database}.statsRecords SET id=${quote(c.oldId)}, versionHash=${literal(c.oldHash)} WHERE rowid=${c.rowid} AND id=${quote(c.id)} AND versionHash IS ${literal(c.hash)};`,
        ),
        'COMMIT;',
      ].join('\n'),
    )
    if (apply) {
      for (const c of changes) {
        const result = db
          .query(
            `UPDATE d${c.database}.statsRecords SET id=?, versionHash=? WHERE rowid=? AND id=? AND versionHash IS ?`,
          )
          .run(c.id, c.hash, c.rowid, c.oldId, c.oldHash)
        if (result.changes !== 1) throw new Error('Concurrent or unexpected row change')
      }
      paths.forEach((_, i) => {
        const count = db.query(`SELECT count(*) n FROM d${i}.statsRecords`).get() as {
          n: number
        }
        if (count.n !== before[i]) throw new Error('Row count changed')
        const remaining = db
          .query(`SELECT count(*) n FROM d${i}.statsRecords WHERE id NOT LIKE 'ss-%'`)
          .get() as { n: number }
        if (remaining.n) throw new Error('Unexpected IDs remain')
        const check = db.query(`PRAGMA d${i}.quick_check`).all()
        if (JSON.stringify(check) !== '[{"quick_check":"ok"}]')
          throw new Error(`Integrity check failed: ${JSON.stringify(check)}`)
        if (db.query(`PRAGMA d${i}.foreign_key_check`).all().length)
          throw new Error('Foreign key check failed')
      })
    }
    db.exec('COMMIT')
    const summary = {
      applied: apply,
      identities: new Set(changes.map(c => c.id)).size,
      rows: changes.length,
      perDatabase: paths.map((path, i) => ({
        path,
        rows: changes.filter(c => c.database === i).length,
      })),
    }
    writeFileSync(`${output}/result.json`, JSON.stringify(summary, null, 2))
    return summary
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    throw error
  } finally {
    db.close()
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const positional = args.filter(a => a !== '--apply')
  const [output, ...paths] = positional
  if (!output)
    throw new Error(
      'Usage: bun scripts/backfill-statistic-identities.ts [--apply] RECOVERY_DIR SQLITE_PATH...',
    )
  console.log(
    JSON.stringify(backfillStatisticIdentities(paths, output, apply), null, 2),
  )
}
