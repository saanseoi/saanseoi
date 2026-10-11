import { landsdPlaceNameLocales } from '@repo/core/pipeline/services/sources/landsdPlaceNames'
import proj4 from 'proj4'
import type { Database } from 'bun:sqlite'

const hkGrid =
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs'
const object = (value: unknown): any =>
  typeof value === 'string' ? JSON.parse(value) : value

/** Full Place Names source, including terrain names excluded from Settlement. */
export function readLandsdNamingEvidence(db: Database, version: string) {
  const rows = db
    .query(`SELECT sourceRecordId, properties, sourceGeometry
    FROM hkgovLandsdPlaceNames WHERE validFromRelease <= ?
    AND (validToRelease IS NULL OR validToRelease > ?)`)
    .all(version, version) as any[]
  if (!rows.length) throw Error(`No retained LandsD naming evidence for ${version}`)
  const names: Array<{
    divisionId: string
    locale: string
    name: string
    nameAlts?: string
  }> = []
  const divisions = rows.map(row => {
    const properties = object(row.properties)
    const geometry = object(row.sourceGeometry)
    for (const [locale, labels] of Object.entries(
      landsdPlaceNameLocales(properties.placeNames),
    ) as Array<[string, { official: string | null; alias: string[] }]>)
      if (labels.official)
        names.push({
          divisionId: row.sourceRecordId,
          locale,
          name: labels.official,
          nameAlts: labels.alias.filter(name => name !== labels.official).join('|'),
        })
    if (geometry?.type !== 'Point')
      throw Error('LandsD naming evidence requires native points.')
    return {
      id: row.sourceRecordId,
      identifiers: { 'hkgov-landsd': { geoNameId: String(properties.geoNameId) } },
      geometry: {
        type: 'Point',
        coordinates: proj4(hkGrid, 'EPSG:4326', geometry.coordinates),
      },
    }
  })
  return { divisions, names }
}
