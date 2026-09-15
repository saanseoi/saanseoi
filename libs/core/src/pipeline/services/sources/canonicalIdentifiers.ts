/** Canonical identifiers use publisher codes and publisher field spelling. */
export function canonicalIdentifiers(value: unknown): Record<string, unknown> | null {
  if (value == null) return null
  const input = typeof value === 'string' ? JSON.parse(value) : value
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Identifiers must be an object.')
  const groups: Record<string, [string, Record<string, string>]> = {
    hkgovPland: ['PLAND', { ppu: 'PPU', spu: 'SPU', tpu: 'TPU', subunit: 'SUBUNIT' }],
    hkgovPlandNewTown: ['PLAND', { id: 'NEWTOWN' }],
    hkgovCenstatd: ['CENSTATD', { class: 'class', code: 'code' }],
    hkgovLandsd: ['LANDSD', { geoNameId: 'GEO_NAME_ID' }],
    hkgov: [
      'HAD',
      {
        objectId: 'OBJECTID',
        cdsiAdminAreaId: 'CSDI_ADMIN_AREA_ID',
        areaId: 'AREA_ID',
        areaCode: 'AREA_CODE',
      },
    ],
  }
  const scalar: Record<string, string> = {
    hkgovCsuId: 'ALS:CsuId',
    geoAddress: 'ALS:GeoAddress',
    curationId: 'SS:curationId',
  }
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(input)) {
    if (item == null) continue
    const group = groups[key]
    if (group && typeof item === 'object' && !Array.isArray(item)) {
      for (const [field, identifier] of Object.entries(item)) {
        if (identifier != null)
          result[`${group[0]}:${group[1][field] ?? field}`] = identifier
      }
    } else result[scalar[key] ?? key] = item
  }
  return Object.keys(result).length ? result : null
}
