import type { DivisionLookupMaps, PreparedHkgovAlsRow } from './hkgovAlsTypes'
import { divisionFields } from '../../../pipeline/divisions/divisionMembership'

/** Run after all reviewed coordinate and locality corrections, including synthetic premises. */
export function applyAlsDivisionMembership(
  rows: PreparedHkgovAlsRow[],
  lookup: DivisionLookupMaps,
) {
  if (!lookup.membership)
    throw new Error('ALS preparation requires a Division geometry index.')
  for (const row of rows) {
    const geometry = row.geometry ? JSON.parse(row.geometry) : null
    const coordinates =
      geometry?.type === 'Point' && Array.isArray(geometry.coordinates)
        ? geometry.coordinates
        : null
    const sources = row.sources ? JSON.parse(row.sources) : {}
    const en = row.engPremisesAddressJson ? JSON.parse(row.engPremisesAddressJson) : {}
    const zh = row.chiPremisesAddressJson ? JSON.parse(row.chiPremisesAddressJson) : {}
    const names = [
      { locale: 'en', name: en.EngVillage?.LocationName },
      { locale: 'en', name: en.EngStreet?.LocationName },
      { locale: 'zh-hant', name: zh.ChiVillage?.LocationName },
      { locale: 'zh-hant', name: zh.ChiStreet?.LocationName },
      { locale: 'en', name: row.enVillageName },
      { locale: 'zh-hant', name: row.zhHantVillageName },
      ...(sources.townAssociation?.names ?? []),
      ...(sources.landformAssociation?.names ?? []),
    ]
    const result = lookup.membership.resolve({
      lng: coordinates?.[0] ?? null,
      lat: coordinates?.[1] ?? null,
      districtId: row.districtId,
      names,
      fallback: {
        countryId: row.countryId,
        areaId: row.areaId,
        districtId: row.districtId,
        townId: row.townId,
        landformId: row.landformId,
      },
      fallbackMethod: 'text',
    })
    for (const field of new Set(Object.values(divisionFields)))
      row[field] = result.references[field] ?? null
    row.areaMatchStatus = row.areaId ? 'matched' : 'unmatched'
    row.districtMatchStatus = row.districtId ? 'matched' : 'unmatched'
    delete sources.townAssociation
    delete sources.landformAssociation
    sources.divisionAssociation = {
      divisionSnapshotId: lookup.snapshotId,
      divisionAreaSnapshotId: lookup.areaSnapshotId,
      evidence: result.evidence,
      names: names.filter(entry => typeof entry.name === 'string' && entry.name.trim()),
    }
    row.sources = JSON.stringify(sources)
  }
}
