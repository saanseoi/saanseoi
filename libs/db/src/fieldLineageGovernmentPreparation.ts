/** Exact scalar preparation branches; geometry acquisition and joins have separate nodes. */
export function governmentPreparedSpecification(
  datasetCode: string,
  resourceType: string,
  path: string,
) {
  const had = datasetCode === 'ds-hk-hkgov-had-division-area-district'
  const town = datasetCode === 'ds-hk-hkgov-pland-division-new-town'
  if (!had && !town) return null
  const fields: Record<string, [string[], string]> = had
    ? {
        id: [['AREA_ID'], '"HAD:" + requireString(properties.AREA_ID)'],
        area_id: [['AREA_ID'], 'requireString(properties.AREA_ID)'],
        area_code: [['AREA_CODE'], 'requireString(properties.AREA_CODE)'],
        object_id: [['OBJECTID'], 'optionalInteger(properties.OBJECTID)'],
        csdi_admin_area_id: [
          ['CSDI_ADMIN_AREA_ID'],
          'optionalInteger(properties.CSDI_ADMIN_AREA_ID)',
        ],
      }
    : {
        newtown_id: [
          ['NewTown_en'],
          'requireName(properties.NewTown_en).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); reject an empty result.',
        ],
        planning_level: [[], '"newtown"'],
        hierarchy: [[], '[]'],
        source_cell_ids: [[], '[]'],
        i18n: [
          ['NewTown_en', 'NewTown_Tc', 'NewTown_Sc'],
          '[{locale:"en",name:requireName(properties.NewTown_en)},{locale:"zh-hant",name:requireName(properties.NewTown_Tc)},{locale:"zh-hans",name:requireName(properties.NewTown_Sc)}]',
        ],
        identifiers: [
          ['NewTown_en'],
          '{ "PLAND:NEWTOWN": normaliseProviderId(requireName(properties.NewTown_en)) }',
        ],
        id: [
          ['NewTown_en'],
          resourceType === 'divisionArea'
            ? '"PLAND:NEWTOWN:" + canonicalDivisionId'
            : 'canonicalDivisionId',
        ],
        division_id: [['NewTown_en'], 'canonicalDivisionId'],
      }
  const selected = fields[path]
  if (!selected) return null
  return {
    publisherPaths: selected[0].map(field => `properties.${field}`),
    expression: selected[1],
    implementation: {
      path: had
        ? 'apps/harbour-cli/src/lib/sources/hkgov/had/hkgovHad.ts'
        : 'apps/harbour-cli/src/lib/sources/hkgov/pland/hkgovPlandNewTown.ts',
      symbol: had
        ? 'normaliseHkgovHadDistrictFeature'
        : resourceType === 'divisionArea'
          ? 'writeDivisionAreaParquet'
          : 'writeDivisionParquet',
    },
    ...(town
      ? {
          canonicalDivisionId: {
            namespace: '68cfb529-cbcb-58c9-bdf1-ff9c8e5b9c7c',
            name: 'requireName(properties.NewTown_en).toLowerCase().replace(/\\s+/g, " ").replace(/\\s*-\\s*/g, "-")',
            expression:
              'canonicalGeneratedId(buildDeterministicUuidV5(namespace, "hkgov-pland-new-town:hk:planning:" + sourceVersion + ":" + name))',
          },
          guards: [
            'requireName trims a non-empty string. Require all three publisher names, supported source version, expected feature count and unique provider IDs before writing the prepared set.',
          ],
        }
      : {
          guards: [
            'Require 18 features, unique non-empty publisher OBJECTID and registered source version 2022. requireString trims a non-empty string; optionalInteger accepts safe integer numbers or integer strings; other values become null.',
          ],
        }),
    usesSourceVersion: town && ['id', 'division_id'].includes(path),
  }
}
