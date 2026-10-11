import type { CurrentFieldRule } from './fieldLineageCurrentRules'

/** Provider branches in buildIdentifiers and geometrySourceReferences. */
export function geometryReferenceRule(
  field: string,
  datasetCode: string,
): CurrentFieldRule | null {
  if (field !== 'identifiers' && field !== 'sources') return null
  const saanseoi = datasetCode === 'ds-hk-saanseoi-division'
  const town = datasetCode === 'ds-hk-hkgov-pland-division-new-town'
  const planning = datasetCode === 'ds-hk-hkgov-pland-division-pu'
  const had = datasetCode === 'ds-hk-hkgov-had-division-area-district'
  const census = datasetCode.startsWith('ds-hk-hkgov-censtatd-')
  const implementation = {
    path: 'libs/core/src/pipeline/services/divisions/divisionGeometry.ts',
    symbol: field === 'sources' ? 'geometrySourceReferences' : 'buildIdentifiers',
  }
  const result = (expression: string, inputs: string[], guards?: string[]) => ({
    expression,
    inputs,
    implementation,
    ...(field === 'identifiers'
      ? {
          additionalImplementations: [
            {
              path: 'libs/core/src/pipeline/services/sources/canonicalIdentifiers.ts',
              symbol: 'canonicalIdentifiers',
            },
          ],
        }
      : {}),
    ...(guards ? { guards } : {}),
  })
  if (field === 'sources') {
    if (saanseoi) return result('row.sources', ['sources'])
    if (town)
      return result(
        '{ hkgovPland: [{ record_id: asNonEmptyString(row.newtown_id) }] }',
        ['newtown_id'],
        ['Require a non-empty native town ID.'],
      )
    if (planning)
      return result(
        '(typeof row.source_cell_ids === "string" ? JSON.parse(row.source_cell_ids) : row.source_cell_ids).map(cell_id => ({ cell_id })) wrapped as { hkgovPland: cells }',
        ['source_cell_ids'],
        ['Require a non-empty array of non-empty string cell IDs.'],
      )
    if (census)
      return result(
        'When row.sources is an array containing non-empty string sourceRecordId values, return { hkgovCenstatd: ids.map(record_id => ({ record_id })) }; otherwise return { sourceResolutions: { entityId: canonicalId } }.',
        ['sources', 'id', 'source'],
      )
    return result('{ sourceResolutions: { entityId: canonicalId } }', ['id', 'source'])
  }
  if (saanseoi)
    return result('canonicalIdentifiers(row.identifiers ?? null)', ['identifiers'])
  if (town)
    return result(
      'canonicalIdentifiers({ hkgovPlandNewTown: { id: asNonEmptyString(row.newtown_id) } })',
      ['newtown_id'],
    )
  if (planning)
    return result(
      'canonicalIdentifiers({ hkgovPland: { ppu: asNonEmptyString(readIdentifier(row.identifiers, "PLAND:PPU")), spu: asNonEmptyString(readIdentifier(row.identifiers, "PLAND:SPU")), tpu: asNonEmptyString(readIdentifier(row.identifiers, "PLAND:TPU")), subunit: asNonEmptyString(readIdentifier(row.identifiers, "PLAND:SUBUNIT")) } })',
      ['identifiers'],
    )
  if (had)
    return result(
      'canonicalIdentifiers({ hkgov: { objectId: asOptionalInteger(row.object_id), cdsiAdminAreaId: asOptionalInteger(row.csdi_admin_area_id), areaId: asNonEmptyString(row.area_id), areaCode: asNonEmptyString(row.area_code) } })',
      ['object_id', 'csdi_admin_area_id', 'area_id', 'area_code'],
    )
  if (census)
    return result(
      'canonicalIdentifiers({ "CENSTATD:dcClass": asNonEmptyString(row.district_class), "CENSTATD:dcCode": asOptionalInteger(row.district_code), ...(/^CENSTATD:area:(HK|KLN|NT)$/.test(String(row.id)) ? { "CENSTATD:code": String(row.id).split(":")[2] } : {}) })',
      ['district_class', 'district_code', 'id'],
    )
  return result('null', [])
}
