import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

const targets = {
  hkgovAlsAddresses3d: ['ds-hk-hkgov-dpo-address', 'address'],
  hkgovLandsdRoadCentrelines: ['ds-hk-hkgov-landsd-road-centreline', 'street'],
} as const

type Release = { id: string; code: string; sourceVersion: string; status: string }
type Row = {
  sourceRecordId: string
  versionHash: string
  releaseId: string
  rawProperties: string | null
  sourceGeometry?: string
  sources: string | null
  createdAt: string
  updatedAt: string
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, sorted(child)]),
    )
  }
  return value
}

export function sourceContentHash(table: keyof typeof targets, row: Row) {
  const properties = row.rawProperties === null ? null : JSON.parse(row.rawProperties)
  const payload =
    table === 'hkgovAlsAddresses3d'
      ? properties
      : sorted({
          sourceRecordId: row.sourceRecordId,
          rawProperties: properties,
          sourceGeometry: JSON.parse(row.sourceGeometry!),
        })
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

const literal = (value: string | number | null) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`

/** Read-only preparation. Apply the returned SQL to the source shard before migration. */
export function prepareSourceVersioningMigration(source: Database, meta: Database) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS __sourceVersioningMap (
      tableName TEXT NOT NULL, sourceRecordId TEXT NOT NULL, oldVersionHash TEXT NOT NULL,
      oldReleaseId TEXT NOT NULL, versionHash TEXT NOT NULL, validFromRelease TEXT NOT NULL,
      validToRelease TEXT, isCurrent INTEGER NOT NULL, representative INTEGER NOT NULL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
      PRIMARY KEY(tableName,sourceRecordId,oldVersionHash,oldReleaseId)
    );`,
    'DELETE FROM __sourceVersioningMap;',
  ]
  const summaries = []
  for (const [table, [datasetCode, resourceType]] of Object.entries(targets) as Array<
    [keyof typeof targets, readonly [string, string]]
  >) {
    const columns = source.query(`PRAGMA table_info("${table}")`).all() as Array<{
      name: string
    }>
    if (!columns.length || columns.some(column => column.name === 'validFromRelease')) {
      throw new Error(
        `${table}: expected the source schema before the versioning migration`,
      )
    }
    const rows = source.query(`SELECT * FROM "${table}"`).all() as Row[]
    if (!rows.length) {
      summaries.push({ table, before: 0, after: 0 })
      continue
    }
    const registered = meta
      .query(`SELECT r.id,r.code,r.sourceVersion,r.status FROM releases r
      JOIN datasets d ON d.id=r.datasetId WHERE d.code=? AND r.resourceType=?
      ORDER BY r.sourceVersion,r.id`)
      .all(datasetCode, resourceType) as Release[]
    const byId = new Map(registered.map(release => [release.id, release]))
    const years = new Set<string>()
    for (const row of rows) {
      const release = byId.get(row.releaseId)
      if (!release || !['published', 'superseded'].includes(release.status)) {
        throw new Error(
          `${table}: release ${row.releaseId} is missing or not complete; finish or roll back that release first`,
        )
      }
      years.add(release.sourceVersion.slice(0, 4))
    }
    const releases = registered.filter(
      release =>
        years.has(release.sourceVersion.slice(0, 4)) &&
        ['published', 'superseded'].includes(release.status),
    )
    const ordinals = new Map(releases.map((release, index) => [release.id, index]))
    const code = (release: Release) =>
      table === 'hkgovAlsAddresses3d' ? release.sourceVersion : release.code
    const groups = new Map<string, Row[]>()
    const seen = new Set<string>()
    for (const row of rows) {
      const occurrence = JSON.stringify([row.sourceRecordId, row.releaseId])
      if (seen.has(occurrence))
        throw new Error(
          `${table}: ambiguous versions within release for ${row.sourceRecordId}`,
        )
      seen.add(occurrence)
      const hash = sourceContentHash(table, row)
      const key = JSON.stringify([row.sourceRecordId, hash])
      const group = groups.get(key) ?? []
      group.push(row)
      groups.set(key, group)
    }
    for (const [key, group] of groups) {
      group.sort((a, b) => ordinals.get(a.releaseId)! - ordinals.get(b.releaseId)!)
      const intervals: Row[][] = []
      for (const row of group) {
        const previous = intervals.at(-1)?.at(-1)
        if (
          !previous ||
          ordinals.get(row.releaseId)! !== ordinals.get(previous.releaseId)! + 1
        )
          intervals.push([row])
        else intervals.at(-1)!.push(row)
      }
      for (const [intervalIndex, interval] of intervals.entries()) {
        const first = interval[0]!
        const last = interval.at(-1)!
        const firstIndex = ordinals.get(first.releaseId)!
        const lastIndex = ordinals.get(last.releaseId)!
        if (last.sources !== null && !Array.isArray(JSON.parse(last.sources)))
          throw new Error(`${table}: sources must be an array or null`)
        const createdAt = interval.map(row => row.createdAt).sort()[0]!
        const updatedAt = interval
          .map(row => row.updatedAt)
          .sort()
          .at(-1)!
        const contentHash = JSON.parse(key)[1] as string
        const versionHash =
          intervalIndex === 0
            ? contentHash
            : createHash('sha256')
                .update(`lifecycle:${contentHash}:${code(releases[firstIndex]!)}`)
                .digest('hex')
        for (const row of interval) {
          const values = [
            table,
            row.sourceRecordId,
            row.versionHash,
            row.releaseId,
            versionHash,
            code(releases[firstIndex]!),
            releases[lastIndex + 1] ? code(releases[lastIndex + 1]!) : null,
            lastIndex === releases.length - 1 ? 1 : 0,
            row === last ? 1 : 0,
            createdAt,
            updatedAt,
          ]
          const statement = `INSERT INTO __sourceVersioningMap VALUES (${values.map(literal).join(',')});`
          if (Buffer.byteLength(statement) > 96 * 1024)
            throw new Error(
              `${table}: combined provenance exceeds the migration statement budget`,
            )
          statements.push(statement)
        }
      }
    }
    summaries.push({ table, before: rows.length, after: groups.size })
  }
  return { sql: statements.join('\n'), summaries }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      meta: { type: 'string' },
      output: { type: 'string' },
    },
    strict: true,
  })
  if (!values.source || !values.meta || !values.output)
    throw new Error(
      'Usage: bun prepare-source-versioning-migration.ts --source source.sqlite --meta meta.sqlite --output preparation.sql',
    )
  const source = new Database(values.source, { readonly: true })
  const meta = new Database(values.meta, { readonly: true })
  try {
    const prepared = prepareSourceVersioningMigration(source, meta)
    await writeFile(values.output, prepared.sql, { flag: 'wx' })
    console.log(JSON.stringify(prepared.summaries, null, 2))
  } finally {
    source.close()
    meta.close()
  }
}
