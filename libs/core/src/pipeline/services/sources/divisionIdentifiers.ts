import { camelCaseFieldName } from '../../../jsonKeys'

export type DivisionIdentifierValue = string | number | Array<string | number>
export type DivisionIdentifiers = Record<
  string,
  Record<string, DivisionIdentifierValue>
>

const publishers: Record<string, string> = {
  LANDSD: 'hkgov-landsd',
  PLAND: 'hkgov-pland',
  CENSTATD: 'hkgov-censtatd',
  HAD: 'hkgov-had',
  ALS: 'hkgov-dpo',
  SS: 'saanseoi',
  hkgovLandsd: 'hkgov-landsd',
  hkgovPland: 'hkgov-pland',
  hkgovPlandNewTown: 'hkgov-pland',
  hkgovCenstatd: 'hkgov-censtatd',
  hkgov: 'hkgov-had',
  saanseoiIsland: 'saanseoi',
}
const fields: Record<string, string> = {
  GEO_NAME_ID: 'geoNameId',
  PPU: 'ppu',
  SPU: 'spu',
  TPU: 'tpu',
  SUBUNIT: 'subunit',
  NEWTOWN: 'newTownId',
  OBJECTID: 'objectId',
  CSDI_ADMIN_AREA_ID: 'csdiAdminAreaId',
  cdsiAdminAreaId: 'csdiAdminAreaId',
  AREA_ID: 'areaId',
  AREA_CODE: 'areaCode',
  CsuId: 'csuId',
  GeoAddress: 'geoAddress',
}

/** Publisher code → identifier type → unchanged value. Also used by the data backfill. */
export function divisionIdentifiers(value: unknown): DivisionIdentifiers | null {
  const input = typeof value === 'string' ? JSON.parse(value) : value
  if (input == null) return null
  if (typeof input !== 'object' || Array.isArray(input))
    throw new Error('Division identifiers must be an object.')
  const result: DivisionIdentifiers = {}
  function put(publisher: string, field: string, value: unknown) {
    if (value == null) return
    const type = fields[field] ?? camelCaseFieldName(field)
    if (
      [
        'geometry',
        'method',
        'curation',
        'geometryPartition',
        'islandGroup',
        'source',
      ].includes(type)
    )
      throw new Error(
        `Division provenance ${publisher}.${type} belongs in sources, not identifiers.`,
      )
    if (
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(publisher) ||
      !/^[a-z][a-zA-Z0-9]*$/.test(type)
    )
      throw new Error(`Invalid division identifier namespace: ${publisher}.${type}`)
    const values = Array.isArray(value) ? value : [value]
    if (
      publisher === 'saanseoi' &&
      type === 'sourceId' &&
      values.some(
        item =>
          typeof item === 'string' &&
          /^(LANDSD:PLACE_NAME:|PROTOMAPS:LAND:|OSM:)/.test(item),
      )
    )
      throw new Error(
        'Publisher source IDs must use their publisher namespace, not saanseoi.sourceId.',
      )
    if (values.some(item => typeof item !== 'string' && typeof item !== 'number'))
      throw new Error(
        `Division identifier ${publisher}.${type} must contain text or numbers.`,
      )
    const group = result[publisher] ?? {}
    result[publisher] = group
    if (
      Object.hasOwn(group, type) &&
      JSON.stringify(group[type]) !== JSON.stringify(value)
    )
      throw new Error(`Conflicting division identifier: ${publisher}.${type}`)
    group[type] = value as DivisionIdentifierValue
  }
  for (const [key, item] of Object.entries(input)) {
    if (item == null) continue
    const colon = key.indexOf(':')
    if (colon >= 0) {
      const authority = key.slice(0, colon)
      const publisher = publishers[authority]
      if (!publisher)
        throw new Error(`Unknown division identifier authority: ${authority}`)
      put(publisher, key.slice(colon + 1), item)
    } else if (key === 'hkgovCsuId' || key === 'geoAddress') {
      put('hkgov-dpo', key === 'hkgovCsuId' ? 'csuId' : key, item)
    } else if (
      publishers[key] ||
      key === 'saanseoi' ||
      key === 'overture' ||
      key === 'protomaps' ||
      key === 'osm' ||
      key === 'wikidata' ||
      key.includes('-')
    ) {
      if (typeof item !== 'object' || Array.isArray(item))
        throw new Error(
          `Division identifier publisher ${key} must contain identifier types.`,
        )
      for (const [field, identifier] of Object.entries(item))
        put(
          publishers[key] ?? key,
          key === 'hkgovPlandNewTown' && field === 'id' ? 'newTownId' : field,
          identifier,
        )
    } else {
      // Unqualified authored identifiers belong to SaanSeoi.
      put('saanseoi', key, item)
    }
  }
  return Object.keys(result).length ? result : null
}

/** Apply the identifier contract to authored SaanSeoi source properties. */
export function divisionIdentifierProperties(properties: Record<string, unknown>) {
  return 'identifiers' in properties
    ? { ...properties, identifiers: divisionIdentifiers(properties.identifiers) }
    : properties
}

/** Retain the publisher's Wikidata link as a grouped external identifier. */
export function divisionIdentifiersWithWikidata(value: unknown, wikidata: unknown) {
  const identifiers = divisionIdentifiers(value)
  if (wikidata == null || wikidata === '') return identifiers
  if (typeof wikidata !== 'string' || !/^Q[1-9][0-9]*$/.test(wikidata))
    throw new Error('Invalid Division Wikidata identifier.')
  const existing = identifiers?.wikidata?.id
  if (existing !== undefined && existing !== wikidata)
    throw new Error('Conflicting division identifier: wikidata.id')
  return { ...identifiers, wikidata: { ...identifiers?.wikidata, id: wikidata } }
}
