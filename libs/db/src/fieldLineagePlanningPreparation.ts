import catalogue from '../../../fixtures/meta/fieldLineage/operations.json'
import { governmentPreparedSpecification } from './fieldLineageGovernmentPreparation'
const units = 'apps/harbour-cli/src/lib/sources/hkgov/pland/hkgovPland.ts'
const towns = 'apps/harbour-cli/src/lib/sources/hkgov/pland/hkgovPlandNewTown.ts'
const materialiser =
  'apps/harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadPreparation.ts'

export function planningPreparedSpecification(
  datasetCode: string,
  resourceType: string,
  path: string,
) {
  const town = datasetCode === 'ds-hk-hkgov-pland-division-new-town'
  if (!town && datasetCode !== 'ds-hk-hkgov-pland-division-pu') return null
  const make = (inputs: string[], expression: string, symbol: string, extra = {}) => ({
    inputs,
    expression,
    rawArchive: false,
    implementation: { path: town ? towns : units, symbol },
    ...extra,
  })
  if (path === 'planningRows')
    return make(
      ['sourceVersion'],
      'Build the complete ordered Planning Division collection from the selected publisher archive.',
      town ? 'normaliseFeature' : 'buildPlanningDivisions',
      {
        rawArchive: true,
        ...(town
          ? {
              canonicalIdentity: governmentPreparedSpecification(
                datasetCode,
                'division',
                'id',
              ),
              steps: [
                'Require all three locale names, supported cohort feature count and unique normalised provider IDs.',
                'Require WGS84 polygonal geometry. Keep a valid geometry; otherwise JSTS buffer(0) must produce a valid Polygon/MultiPolygon. Preserve originalGeometry separately.',
              ],
            }
          : {
              geometry: catalogue.operations['planning-unit-geometry'],
              namespace: '68cfb529-cbcb-58c9-bdf1-ff9c8e5b9c7c',
              steps: [
                'Require numeric PPU/SPU/TPU codes and Subunit for 2021 or SB_VC otherwise, preserving digit strings. Retain source record identity PLAND:<TPU>:<subunit>:<member ordinal>.',
                'Group cells independently into ppu, spu, tpu and subunit (TPU:subunit) maps. Emit levels in ppu/spu/tpu/subunit order and keys sorted with English numeric collation.',
                'For each group, aggregate repaired cell geometry with the retained geometry policy; keep native cells separately for SOURCE.',
                'canonicalGeneratedId(UUIDv5(namespace, "hkgov-pland-pu:hk:planning:" + level + ":" + key)); for subunit the key in the UUID name is TPU-subunit.',
                'Identifiers always include PLAND:PPU, then SPU from level spu, TPU from level tpu, SUBUNIT at subunit. Use the first member codes after grouping.',
                'Hierarchy contains ancestor levels before the current level, using their canonical IDs. source_cell_ids contains sorted PLAND:<TPU>:<subunit> entries, preserving contributing cells.',
                'The Planning Unit writer supplies no i18n column; its normalised locale list is empty.',
              ],
            }),
      },
    )
  if (path === 'geometry')
    return make(
      ['planningRows'],
      'Select the repaired/aggregated geometry for the current Planning row.',
      town ? 'normaliseFeature' : 'buildPlanningDivision',
    )
  if (!town) {
    if (path === 'governmentAreaRows')
      return make(
        ['planningRows'],
        'For every Planning row, write {id:"PLAND:" + row.id,division_id:row.id,geometry:row.geometry,identifiers:row.identifiers,source_cell_ids:row.cellIds,class:"land",is_land:true,is_territorial:true,region:"HK",country:"HK",planning_level:row.level}. Preserve source_properties and repaired_source_feature_ids separately.',
        'writeDivisionAreaParquet',
      )
    const values: Record<string, string> = {
      id:
        resourceType === 'divisionArea'
          ? '"PLAND:" + planningRow.id'
          : 'planningRow.id',
      division_id: 'planningRow.id',
      planning_level: 'planningRow.level',
      identifiers: 'planningRow.identifiers',
      hierarchy: 'planningRow.hierarchy',
      source_cell_ids: 'planningRow.cellIds',
      i18n: '[]',
    }
    if (values[path])
      return make(
        path === 'i18n' ? [] : ['planningRows'],
        values[path]!,
        resourceType === 'divisionArea'
          ? 'writeDivisionAreaParquet'
          : 'writeDivisionParquet',
      )
  }
  if (path === 'sourceReleaseTranslations')
    return {
      inputs: ['sourceReleaseCode'],
      rawArchive: false,
      implementation: {
        path: 'apps/harbour-cli/src/lib/i18n/sourceReleaseTranslations.ts',
        symbol: 'resolveSourceReleaseNameTranslationsBatch',
      },
      expression:
        'No translation additions are required by the current Planning producers: New Towns require en/zh-hant/zh-hans names; Planning Units supply no source locale names from which to translate.',
      guards: [
        'If a future producer supplies an incomplete locale set, this rule must acquire the exact source-release translation fixture; it must not silently infer a translation.',
      ],
    }
  if (path === 'translatedPlanningDivisions')
    return {
      inputs: ['planningRows', 'sourceReleaseTranslations'],
      rawArchive: false,
      implementation: { path: materialiser, symbol: 'readPreparedDivisionsInternal' },
      expression:
        'Build a map of all prepared Planning Divisions by canonical ID, with class and resolved locale names, before constructing any hierarchy.',
      steps: [
        'Require each prepared id/planning_level and geometry. Class is planning-<level>; levels are newtown/ppu=3, spu=4, tpu=5, subunit=6.',
        'New Towns retain the three publisher locale names; Planning Units have no locale rows. Reject a missing localisation result.',
        'For every hierarchy edge require the ancestor to exist in this collection. Use its class and locales; materialise correlated paths and validate parent-before-child order.',
      ],
    }
  return null
}
