/** Read published API snapshots and prepare an immutable spatial-crosswalk artefact. */
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildGeographicCrosswalk,
  geographicCrosswalkStatements,
  type CrosswalkDivision,
} from '../src/lib/pipeline/divisions/geographicCrosswalk'
const [origin, geographicReleaseSet, sourceReleaseSet, directory] =
  process.argv.slice(2)
if (!origin || !geographicReleaseSet || !sourceReleaseSet || !directory)
  throw Error(
    'Usage: bun prepareGeographicCrosswalk.ts <api-origin> <geographic-release-set> <planning-release-set> <output-directory>',
  )

async function load(
  domain: string,
  releaseSet: string,
  version: string,
  variant: string,
) {
  const divisions = new Map<string, any>(),
    areas = new Map<string, any>()
  let meta: any
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(`/divisions/${version}`, origin)
    url.search = new URLSearchParams({
      domain,
      releaseSet,
      profile: 'full',
      locales: 'null',
      include: `areas:${variant}`,
      'page[limit]': '1000',
      'page[offset]': String(offset),
      ...(domain === 'geographic' ? { inventory: 'saanseoi' } : {}),
    }).toString()
    const response = await fetch(url, {
      headers: process.env.SAANSEOI_API_KEY
        ? { 'X-API-Key': process.env.SAANSEOI_API_KEY }
        : {},
    })
    if (!response.ok) throw Error(`Crosswalk input ${domain}: HTTP ${response.status}`)
    const page = (await response.json()) as any
    if (meta && meta.apiReleaseSet !== page.meta.apiReleaseSet)
      throw Error('Release selection changed between pages')
    meta = page.meta
    for (const row of page.data) divisions.set(row.id, row)
    for (const row of page.included ?? [])
      if (row.type === 'division-areas') areas.set(row.id, row)
    if (page.data.length < 1000) break
  }
  const ids = (rows: any[]) => [...new Set(rows.map(row => row.attributes.snapshotId))]
  const snapshots = ids([...divisions.values()]),
    areaSnapshots = ids([...areas.values()])
  if (
    snapshots.length !== 1 ||
    areaSnapshots.length !== 1 ||
    !snapshots[0] ||
    !areaSnapshots[0]
  )
    throw Error(`Expected exact Division and Area snapshots for ${domain}`)
  const polygons = new Map<string, any[]>()
  for (const row of areas.values()) {
    const a = row.attributes
    if (!['Polygon', 'MultiPolygon'].includes(a.geometry?.type)) continue
    polygons.set(a.divisionId, [...(polygons.get(a.divisionId) ?? []), a.geometry])
  }
  const selected = [...divisions.values()].filter(
    row => domain === 'geographic' || row.attributes.class === 'planning-tpu',
  )
  const missing = selected.filter(row => !polygons.has(row.id)).map(row => row.id)
  if (domain !== 'geographic' && missing.length)
    throw Error(`${missing.length} TPUs lack polygons`)
  const rows: CrosswalkDivision[] = selected
    .filter(row => polygons.has(row.id))
    .map(row => ({ id: row.id, areas: polygons.get(row.id)! }))
  if (!rows.length) throw Error(`No usable polygons for ${domain}`)
  return {
    rows,
    missing,
    snapshotId: String(snapshots[0]),
    areaSnapshotId: String(areaSnapshots[0]),
    meta,
  }
}
const geographic = await load('geographic', geographicReleaseSet, 'v0.2', 'saanseoi')
const source = await load('hkgov-pland-pu', sourceReleaseSet, 'v0.1', 'hkgov-pland-pu')
const result = buildGeographicCrosswalk(
  {
    geographicReleaseSet: geographic.meta.apiReleaseSet,
    geographicSnapshotId: geographic.snapshotId,
    geographicAreaSnapshotId: geographic.areaSnapshotId,
    sourceReleaseSet: source.meta.apiReleaseSet,
    sourceSnapshotId: source.snapshotId,
    sourceAreaSnapshotId: source.areaSnapshotId,
    sourceDomain: 'hkgov-pland-pu',
    sourceCohort: source.meta.cohort,
  },
  source.rows,
  geographic.rows,
)
await mkdir(directory, { recursive: true })
await Bun.write(
  resolve(directory, 'crosswalk.json'),
  `${JSON.stringify(
    { ...result, missingGeographicGeometry: geographic.missing },
    null,
    2,
  )}\n`,
)
await Bun.write(
  resolve(directory, 'crosswalk.sql'),
  `${geographicCrosswalkStatements(result).join('\n')}\n`,
)
console.log(
  JSON.stringify(
    {
      id: result.id,
      sourceDivisions: source.rows.length,
      geographicDivisions: geographic.rows.length,
      memberships: result.memberships.length,
      missingGeographicGeometry: geographic.missing.length,
      directory,
    },
    null,
    2,
  ),
)
