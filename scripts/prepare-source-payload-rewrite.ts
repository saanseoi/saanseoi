import { Database } from 'bun:sqlite'
import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { link, unlink, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import {
  overtureSourceTables,
  isSupplementalDivisionPayload,
  rewriteOvertureSourcePayload,
} from '../libs/core/src/pipeline/services/sources/sourcePayloadRewrite'

// This offline converter reads the pre-migration rawProperties/sources schema.
const { values } = parseArgs({
  options: { database: { type: 'string' }, output: { type: 'string' } },
  strict: true,
})
if (!values.database || !values.output)
  throw new Error(
    'Usage: bun scripts/prepare-source-payload-rewrite.ts --database source.sqlite --output review.sql',
  )
const db = new Database(values.database, { readonly: true })
const partialOutput = `${values.output}.partial`
const output = createWriteStream(partialOutput, { flags: 'wx' })
let outputError: Error | undefined
output.on('error', error => {
  outputError = error
})
const report = {
  database: values.database,
  rewrittenRows: 0,
  rawBytesBefore: 0,
  rawBytesAfter: 0,
  jsonBytesBefore: 0,
  jsonBytesAfter: 0,
  supplementalRowsRequiringUpstreamReplay: 0,
  alsRowsRequiringUpstreamReplay: 0,
}
const literal = (value: string | null) =>
  value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`
const json = (value: unknown) => (value == null ? null : JSON.stringify(value))
const parse = (value: string | null) => (value === null ? null : JSON.parse(value))
try {
  const tables = new Set(
    (
      db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string
      }[]
    ).map(row => row.name),
  )
  for (const table of overtureSourceTables) {
    if (!tables.has(table)) continue
    const columns = new Set(
      (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
        row => row.name,
      ),
    )
    for (const row of db
      .query(
        `SELECT sourceRecordId, versionHash, rawProperties AS properties, sources, ${columns.has('sourceGeometry') ? 'sourceGeometry' : 'NULL AS sourceGeometry'} FROM ${table}`,
      )
      .iterate() as Iterable<{
      sourceRecordId: string
      versionHash: string
      properties: string
      sources: string | null
      sourceGeometry: string | null
    }>) {
      if (row.properties == null) continue
      const properties = parse(row.properties)
      if (table === 'overtureDivisions' && isSupplementalDivisionPayload(properties)) {
        report.supplementalRowsRequiringUpstreamReplay++
        continue
      }
      const replacement = rewriteOvertureSourcePayload({
        ...row,
        properties,
        sources: parse(row.sources),
        sourceGeometry: parse(row.sourceGeometry),
      })
      if (!replacement) continue
      const propertiesJson = JSON.stringify(replacement.properties)
      const statement = `UPDATE ${table} SET rawProperties = ${literal(propertiesJson)}, sourceGeometry = ${literal(json(replacement.sourceGeometry))}, sources = ${literal(json(null))} WHERE sourceRecordId = ${literal(row.sourceRecordId)} AND versionHash = ${literal(row.versionHash)} AND rawProperties = ${literal(row.properties)} AND sourceGeometry IS ${literal(row.sourceGeometry)} AND sources IS ${literal(row.sources)};\n`
      if (outputError) throw outputError
      if (!output.write(statement)) await once(output, 'drain')
      report.rewrittenRows += 1
      report.rawBytesBefore += Buffer.byteLength(row.properties)
      report.rawBytesAfter += Buffer.byteLength(propertiesJson)
      report.jsonBytesBefore +=
        Buffer.byteLength(row.properties) +
        Buffer.byteLength(row.sources ?? '') +
        Buffer.byteLength(row.sourceGeometry ?? '')
      report.jsonBytesAfter +=
        Buffer.byteLength(propertiesJson) +
        Buffer.byteLength(json(null) ?? '') +
        Buffer.byteLength(json(replacement.sourceGeometry) ?? '')
    }
  }
  for (const table of ['hkgovAlsAddresses2d', 'hkgovAlsAddresses3d']) {
    if (!tables.has(table)) continue
    const row = db
      .query(
        `SELECT count(*) AS n FROM ${table} WHERE json_type(rawProperties, '$.canonicalId') IS NOT NULL OR json_type(rawProperties, '$.properties') IS NOT NULL`,
      )
      .get() as { n: number }
    report.alsRowsRequiringUpstreamReplay += row.n
  }
  output.end()
  await once(output, 'finish')
  await writeFile(`${values.output}.json`, JSON.stringify(report, null, 2), {
    flag: 'wx',
  })
  await link(partialOutput, values.output)
  await unlink(partialOutput)
  console.log(JSON.stringify(report))
} finally {
  db.close()
  output.destroy()
}
