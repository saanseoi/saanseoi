import { Database } from 'bun:sqlite'
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { link, unlink, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { sourceLocatorFromReferences } from '../libs/core/src/pipeline/services/sourcePayload'
import {
  isSupplementalDivisionPayload,
  overtureSourceTables,
  rewriteOvertureSourcePayload,
} from '../libs/core/src/pipeline/services/sourcePayloadRewrite'

/** Offline preparation only. Run before the sources -> sourceLocator schema migration. */
const { values } = parseArgs({
  options: {
    database: { type: 'string' },
    output: { type: 'string' },
  },
  strict: true,
})
if (!values.database || !values.output)
  throw new Error(
    'Usage: bun scripts/prepare-source-contract-rewrite.ts --database source.sqlite --output review.sql',
  )
const tables = [
  ...overtureSourceTables,
  'hkgovAlsAddresses2d',
  'hkgovAlsAddresses3d',
  'hkgovLandsdPlaceNames',
  'hkgovHadDivisionAreas',
  'hkgovCenstatdDivisionAreas',
  'hkgovCenstatdDistrictLandAreaPopulationDensities',
  'hkgovCenstatdStatistics',
  'hkgovPlandPlanningCells',
  'hkgovPlandNewTowns',
]
const db = new Database(values.database, { readonly: true })
const report = {
  database: values.database,
  changedRows: 0,
  tables: {} as Record<string, number>,
  requiresUpstreamReplay: {} as Record<string, number>,
  beforeBytes: 0,
  afterBytes: 0,
}
const forward = createWriteStream(`${values.output}.partial`, { flags: 'wx' })
const rollback = createWriteStream(`${values.output}.rollback.partial`, { flags: 'wx' })
const q = (s: string | null) => (s == null ? 'NULL' : `'${s.replaceAll("'", "''")}'`)
const json = (value: unknown) => (value == null ? null : JSON.stringify(value))
const parse = (value: string | null) => (value == null ? null : JSON.parse(value))
async function append(stream: ReturnType<typeof createWriteStream>, value: string) {
  if (!stream.write(value)) await once(stream, 'drain')
}
function replay(table: string) {
  report.requiresUpstreamReplay[table] = (report.requiresUpstreamReplay[table] ?? 0) + 1
}
try {
  for (const table of tables) {
    const columns = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]
    if (!columns.length) continue
    if (!columns.some(column => column.name === 'sources'))
      throw new Error(
        `${table}: prepare data conversion before applying the sourceLocator migration.`,
      )
    const geometryColumn = columns.some(column => column.name === 'sourceGeometry')
    // Compressed C&SD geometry is deliberately neither decoded nor rewritten here.
    for (const row of db
      .query(
        `SELECT sourceRecordId, versionHash, rawProperties, sources${geometryColumn && table !== 'hkgovCenstatdDivisionAreas' ? ', sourceGeometry' : ''} FROM ${table}`,
      )
      .iterate() as Iterable<{
      sourceRecordId: string
      versionHash: string
      rawProperties: string | null
      sources: string | null
      sourceGeometry?: string | null
    }>) {
      const raw = parse(row.rawProperties)
      const sources = parse(row.sources)
      const overture = (overtureSourceTables as readonly string[]).includes(table)
      if (raw && isSupplementalDivisionPayload(raw)) {
        replay(table)
        continue
      }
      if (
        table.startsWith('hkgovAls') &&
        raw &&
        (raw.type === 'Feature' ||
          'canonicalId' in raw ||
          'areaId' in raw ||
          'canonical_id' in raw)
      ) {
        replay(table)
        continue
      }
      if (table === 'hkgovHadDivisionAreas' || table === 'hkgovLandsdPlaceNames') {
        // Existing projected rows need original FileGDB evidence, not inverse projection.
        const geometry = parse(row.sourceGeometry ?? null)
        const coordinates = geometry?.coordinates
        if (
          Array.isArray(coordinates) &&
          coordinates
            .flat(Infinity)
            .every((n: unknown) => typeof n === 'number' && Math.abs(n) <= 180)
        ) {
          replay(table)
          continue
        }
      }
      let nextRaw = row.rawProperties
      let nextGeometry = row.sourceGeometry
      let locator: Record<string, unknown> | null = null
      if (overture) {
        const replacement = rewriteOvertureSourcePayload({
          sourceRecordId: row.sourceRecordId,
          rawProperties: raw ?? {},
          sources,
          sourceGeometry: parse(row.sourceGeometry ?? null),
        })
        const retainedGeometry =
          replacement?.sourceGeometry ?? parse(row.sourceGeometry ?? null)
        if (
          retainedGeometry != null &&
          !(
            typeof retainedGeometry === 'object' &&
            retainedGeometry.encoding === 'wkb-base64'
          )
        ) {
          // Decoded geometry cannot reconstruct the publisher's original WKB bytes.
          replay(table)
          continue
        }
        if (replacement) {
          nextRaw = json(replacement.rawProperties)
          nextGeometry = json(replacement.sourceGeometry)
        }
      } else {
        // Unknown provenance shapes or mixed processing decisions require review, not deletion.
        if (sources != null && !Array.isArray(sources)) {
          replay(table)
          continue
        }
        if (
          Array.isArray(sources) &&
          sources.some(s => s && ('method' in s || 'action' in s))
        ) {
          replay(table)
          continue
        }
        locator = sourceLocatorFromReferences(sources)
      }
      const nextSources = json(locator)
      if (
        nextRaw === row.rawProperties &&
        nextSources === row.sources &&
        nextGeometry === row.sourceGeometry
      )
        continue
      const identity = `sourceRecordId = ${q(row.sourceRecordId)} AND versionHash = ${q(row.versionHash)}`
      const fields = [
        'rawProperties',
        'sources',
        ...(nextGeometry === undefined ? [] : ['sourceGeometry']),
      ]
      const before = [
        row.rawProperties,
        row.sources,
        ...(nextGeometry === undefined ? [] : [row.sourceGeometry ?? null]),
      ]
      const after = [
        nextRaw,
        nextSources,
        ...(nextGeometry === undefined ? [] : [nextGeometry ?? null]),
      ]
      const update = (a: Array<string | null>, b: Array<string | null>) =>
        `UPDATE ${table} SET ${fields.map((name, i) => `${name} = ${q(b[i] ?? null)}`).join(', ')} WHERE ${identity} AND ${fields.map((name, i) => `${name} IS ${q(a[i] ?? null)}`).join(' AND ')};\n`
      await append(forward, update(before, after))
      await append(rollback, update(after, before))
      report.changedRows++
      report.tables[table] = (report.tables[table] ?? 0) + 1
      report.beforeBytes += before.reduce((n, v) => n + Buffer.byteLength(v ?? ''), 0)
      report.afterBytes += after.reduce((n, v) => n + Buffer.byteLength(v ?? ''), 0)
    }
  }
  forward.end()
  rollback.end()
  await Promise.all([once(forward, 'finish'), once(rollback, 'finish')])
  await writeFile(`${values.output}.json`, JSON.stringify(report, null, 2), {
    flag: 'wx',
  })
  await link(`${values.output}.partial`, values.output)
  await link(`${values.output}.rollback.partial`, `${values.output}.rollback.sql`)
  await unlink(`${values.output}.partial`)
  await unlink(`${values.output}.rollback.partial`)
  process.stdout.write(`${JSON.stringify(report)}\n`)
} finally {
  db.close()
  if (!forward.closed) forward.destroy()
  if (!rollback.closed) rollback.destroy()
}
