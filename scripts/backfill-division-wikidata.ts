import { Database } from 'bun:sqlite'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDivisionBaseHashInput } from '../libs/core/src/pipeline/services/divisions/division'
import { divisionIdentifiersWithWikidata } from '../libs/core/src/pipeline/services/sources/divisionIdentifiers'
import { nativeSourcePayloadHashInput } from '../libs/core/src/pipeline/services/sources/sourcePayload'
import { decompressJsonBrotli } from '../libs/core/src/pipeline/services/storage/brotliJson'
import { createHash } from '../libs/core/src/pipeline/utils'

type Row = Record<string, any>
const q = (v: string | number | null) =>
  v === null
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${v.replaceAll("'", "''")}'`
function decode(row: Row) {
  const {
    repairRowid,
    versionHash,
    sourceReleaseId,
    snapshotId,
    isCurrent,
    createdAt,
    updatedAt,
    ...base
  } = row
  for (const field of [
    'bbox',
    'geometry',
    'hierarchies',
    'cartography',
    'sources',
    'identifiers',
    'properties',
    'sourceGeometry',
  ]) {
    if (typeof base[field] === 'string') base[field] = JSON.parse(base[field])
    if (base[field] instanceof Uint8Array)
      base[field] = decompressJsonBrotli(base[field])
  }
  return base
}

/** One-off local port. Preserve native Overture payloads and repair every hash reference. */
export async function backfillDivisionWikidata(
  paths: string[],
  output: string,
  apply = false,
) {
  if (
    !paths.length ||
    paths.length > 10 ||
    new Set(paths.map(resolvePath => resolve(resolvePath))).size !== paths.length
  )
    throw Error('Provide 1–10 distinct local databases.')
  if (existsSync(output)) throw Error('Use a fresh output directory.')
  mkdirSync(output, { recursive: true })
  const db = new Database(':memory:')
  const report = {
    applied: false,
    counts: {} as Record<string, number>,
    wikidataValues: 0,
  }
  const changes: Row[] = []
  try {
    const tables = paths.map((path, index) => {
      if (!existsSync(path)) throw Error(`Missing database: ${path}`)
      db.query(`ATTACH DATABASE ? AS db${index}`).run(resolve(path))
      return new Set(
        (
          db
            .query(`SELECT name FROM db${index}.sqlite_master WHERE type='table'`)
            .all() as { name: string }[]
        ).map(r => r.name),
      )
    })
    db.exec(apply ? 'BEGIN IMMEDIATE' : 'PRAGMA query_only=ON')
    for (const [index, names] of tables.entries()) {
      for (const table of ['divisions', 'ssDivision']) {
        if (!names.has(table)) continue
        const source = table === 'ssDivision'
        for (const row of db
          .query(`SELECT rowid AS repairRowid,* FROM db${index}.${table}`)
          .iterate() as Iterable<Row>) {
          const base = decode(row)
          const properties = source ? base.properties : base
          if (source && !Object.hasOwn(properties, 'wikidata')) continue
          const identifiers = divisionIdentifiersWithWikidata(
            properties.identifiers,
            properties.wikidata,
          )
          if (properties.wikidata) report.wikidataValues++
          properties.identifiers = identifiers
          delete properties.wikidata
          const column = source ? 'properties' : 'identifiers'
          const value = source
            ? JSON.stringify(properties)
            : identifiers === null
              ? null
              : JSON.stringify(identifiers)
          const hash = row.versionHash
            ? await createHash(
                source
                  ? nativeSourcePayloadHashInput(base as any)
                  : buildDivisionBaseHashInput(base as any),
              )
            : undefined
          if (value === row[column] && (!hash || hash === row.versionHash)) continue
          changes.push({
            index,
            table,
            source,
            column,
            rowid: row.repairRowid,
            id: source ? row.sourceRecordId : row.id,
            oldValue: row[column],
            value,
            oldHash: row.versionHash,
            hash,
          })
          const key = `${index}/${table}`
          report.counts[key] = (report.counts[key] ?? 0) + 1
        }
      }
    }
    writeFileSync(
      resolve(output, 'plan.json'),
      JSON.stringify({ paths, ...report, changes }, null, 2),
    )
    if (!apply) return report
    const rollback = resolve(output, 'rollback.sql')
    writeFileSync(
      rollback,
      paths.map((p, i) => `ATTACH DATABASE ${q(resolve(p))} AS db${i};`).join('\n') +
        '\nBEGIN IMMEDIATE;\n',
    )
    for (const c of changes) {
      appendFileSync(
        rollback,
        `UPDATE db${c.index}.${c.table} SET ${c.column}=${q(c.oldValue)}${c.oldHash ? `,versionHash=${q(c.oldHash)}` : ''} WHERE rowid=${c.rowid};\n`,
      )
      const result = db
        .query(
          `UPDATE db${c.index}.${c.table} SET ${c.column}=?${c.hash ? ',versionHash=?' : ''} WHERE rowid=? AND ${c.column} IS ?${c.oldHash ? ' AND versionHash=?' : ''}`,
        )
        .run(
          ...[
            c.value,
            ...(c.hash ? [c.hash] : []),
            c.rowid,
            c.oldValue,
            ...(c.oldHash ? [c.oldHash] : []),
          ],
        )
      if (result.changes !== 1) throw Error(`Concurrent change: ${c.table}/${c.id}`)
    }
    appendFileSync(rollback, 'COMMIT;\n')
    for (const [i] of tables.entries()) {
      const result = db.query(`PRAGMA db${i}.quick_check`).get() as Row
      if (Object.values(result)[0] !== 'ok')
        throw Error(`Integrity failure in database ${i}`)
    }
    db.exec('COMMIT')
    report.applied = true
    writeFileSync(resolve(output, 'result.json'), JSON.stringify(report, null, 2))
    return report
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}
if (import.meta.main) {
  const [targets, output, mode] = process.argv.slice(2)
  if (!targets || !output || (mode && mode !== '--apply'))
    throw Error(
      'Usage: bun scripts/backfill-division-wikidata.ts TARGETS.json OUTPUT_DIRECTORY [--apply]',
    )
  const paths = ((await Bun.file(targets).json()) as { path: string }[]).map(
    t => t.path,
  )
  console.log(
    JSON.stringify(
      await backfillDivisionWikidata(paths, output, mode === '--apply'),
      null,
      2,
    ),
  )
}
