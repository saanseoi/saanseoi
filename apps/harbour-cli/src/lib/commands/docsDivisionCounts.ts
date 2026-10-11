import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'

/** Query exact retained release archives, never the mutable current serving tables. */
export async function divisionDocumentationValues(
  release: string,
  divisionPath: string,
  areaPath: string,
): Promise<Record<string, string>> {
  const read = async (path: string, type: string, code: string) => {
    const bytes = await readFile(path)
    const files = unzipSync(bytes)
    const manifest = JSON.parse(strFromU8(files['manifest.json']!))
    const records = JSON.parse(strFromU8(files['records.json']!))
    if (
      manifest.releaseCode !== code ||
      manifest.resourceType !== type ||
      manifest.datasetCode !==
        code.replace(/^dr-/, 'ds-').replace(/-\d{4}-\d{2}-\d{2}\.\d+$/, '')
    )
      throw new Error(`Archive does not match ${code}/${type}: ${path}`)
    if (!Array.isArray(records.rows) || !records.rows.length)
      throw new Error(`Empty release archive: ${path}`)
    return {
      manifest,
      rows: records.rows,
      hash: createHash('sha256').update(bytes).digest('hex'),
    }
  }
  if (!/^dr-hk-saanseoi-division-\d{4}-\d{2}-\d{2}\.\d+$/.test(release))
    throw new Error(`Invalid curated division release: ${release}`)
  const divisions = await read(divisionPath, 'division', release)
  const areas = await read(
    areaPath,
    'divisionArea',
    release.replace('division-', 'division-area-'),
  )
  if (
    JSON.stringify(divisions.manifest.sourceReleases) !==
    JSON.stringify(areas.manifest.sourceReleases)
  )
    throw new Error('Division and area ingredient pins differ')
  const db = new Database(':memory:')
  try {
    db.exec(
      'CREATE TABLE divisions (id TEXT PRIMARY KEY, class TEXT NOT NULL, category TEXT NOT NULL); CREATE TABLE areas (id TEXT PRIMARY KEY, divisionId TEXT NOT NULL)',
    )
    db.query(
      "INSERT INTO divisions SELECT json_extract(value, '$.id'), json_extract(value, '$.class'), json_extract(value, '$.category') FROM json_each(?)",
    ).run(JSON.stringify(divisions.rows))
    db.query(
      "INSERT INTO areas SELECT json_extract(value, '$.id'), json_extract(value, '$.divisionId') FROM json_each(?)",
    ).run(JSON.stringify(areas.rows))
    if (
      db
        .query(
          'SELECT id FROM areas WHERE divisionId NOT IN (SELECT id FROM divisions) LIMIT 1',
        )
        .get()
    )
      throw new Error('Area archive references a division outside the release')
    const values: Record<string, string> = {
      countsRelease: release,
      divisionArchiveSha256: divisions.hash,
      areaArchiveSha256: areas.hash,
    }
    const count = (key: string, sql: string) => {
      const row = db.query(sql).get() as { n: number }
      values[key] = row.n.toLocaleString('en-GB')
    }
    count('divisionCount', 'SELECT COUNT(*) n FROM divisions')
    count('areaCount', 'SELECT COUNT(*) n FROM areas')
    count('coveredDivisionCount', 'SELECT COUNT(DISTINCT divisionId) n FROM areas')
    count(
      'uncoveredDivisionCount',
      'SELECT COUNT(*) n FROM divisions WHERE id NOT IN (SELECT divisionId FROM areas)',
    )
    for (const name of [
      'country',
      'sar',
      'area',
      'district',
      'city',
      'town',
      'rural_area',
      'village',
      'hamlet',
      'macrohood',
      'neighbourhood',
      'microhood',
      'major_island',
      'minor_island',
      'islet',
      'island_group',
    ])
      values[`classCount_${name}`] = '0'
    for (const name of ['administrative', 'locality', 'hood', 'landform'])
      values[`categoryCount_${name}`] = '0'
    for (const dimension of ['class', 'category']) {
      const rows = db
        .query(
          `SELECT ${dimension} value, COUNT(*) n FROM divisions GROUP BY ${dimension}`,
        )
        .all() as { value: string; n: number }[]
      for (const row of rows)
        values[`${dimension}Count_${row.value}`] = row.n.toLocaleString('en-GB')
    }
    const pins: Record<string, string> = {
      overtureVersion: 'ds-hk-overture-division',
      overtureAreaVersion: 'ds-hk-overture-division',
      protomapsVersion: 'ds-hk-protomaps-island',
      landsdVersion: 'ds-hk-hkgov-landsd-division',
      rvdVersion: 'ds-hk-hkgov-rvd-division',
    }
    for (const [key, dataset] of Object.entries(pins)) {
      const pin = divisions.manifest.sourceReleases?.find(
        (row: { datasetCode: string }) => row.datasetCode === dataset,
      )
      if (!pin?.sourceVersion) throw new Error(`Missing ingredient pin: ${dataset}`)
      values[key] = pin.sourceVersion
    }
    values.basemapRelease = values.protomapsVersion!.slice(0, 10)
    return values
  } finally {
    db.close()
  }
}
