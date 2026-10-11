import { retainedGovernmentIdentityDocuments } from './fieldLineageStatisticContext'
const prefix = 'ds-hk-hkgov-censtatd-division-statistic-'
const upload =
  'apps/harbour-cli/src/lib/pipeline/divisions/processLocalDivisionGeometrySqlUploadPreparation.ts'
export const districtAreaProfiles: Record<
  string,
  Record<string, { layerName: string; referencePeriodField?: string }>
> = {
  [`${prefix}land-area-population-density-district`]: {
    '2022': { layerName: 'Density_2022' },
    '2024': { layerName: 'Density_2024' },
  },
  [`${prefix}permanent-living-quarters-district`]: {
    '2023-H2': { layerName: 'DCD_LQ_Q32023' },
  },
  [`${prefix}population-households-district`]: {
    '2024': { layerName: 'DC_GHS', referencePeriodField: 'year' },
    '2026-Q2': { layerName: 'DC_GHS', referencePeriodField: 'year' },
  },
  [`${prefix}subdivided-units-district`]: {
    '2016': { layerName: 'DC_16BC_SDU' },
    '2021': { layerName: 'DC_21C_SDU' },
  },
}

/** Native geometry preparation and the identity remapping before canonical normalisation. */
export function governmentAreaSpecification(datasetCode: string, path: string) {
  const district = [
    'subdivided-units-district',
    'population-households-district',
    'land-area-population-density-district',
    'permanent-living-quarters-district',
  ].some(suffix => datasetCode === prefix + suffix)
  const quarters = datasetCode === `${prefix}permanent-living-quarters`
  const had = datasetCode === 'ds-hk-hkgov-had-division-area-district'
  const town = datasetCode === 'ds-hk-hkgov-pland-division-new-town'
  if (!district && !quarters && !had && !town) return null
  const geometrySource = district
    ? 'apps/harbour-cli/src/lib/sources/hkgov/censtatd/hkgovCenstatd.ts'
    : quarters
      ? 'apps/harbour-cli/src/lib/sources/hkgov/censtatd/hkgovCenstatdStatistics.ts'
      : had
        ? 'apps/harbour-cli/src/lib/sources/hkgov/had/hkgovHad.ts'
        : 'apps/harbour-cli/src/lib/sources/hkgov/pland/hkgovPlandNewTown.ts'
  if (path === 'governmentAreaRows')
    return {
      inputs: ['sourceVersion', 'publication.cohortKey', 'preparationTransform'],
      rawArchive: true,
      identityDocuments: retainedGovernmentIdentityDocuments,
      ...(district ? { sourceProfiles: districtAreaProfiles[datasetCode] } : {}),
      expression:
        'Prepare native area rows from the selected archive, then apply the provider input-row identity mapping before normaliseDivisionAreaGeometryRow.',
      implementation: {
        path: upload,
        symbol: had
          ? 'normaliseHkgovHadInputRow'
          : town
            ? 'normaliseHkgovPlandNewTownInputRow'
            : 'normaliseHkgovCenstatdInputRow',
      },
      additionalImplementations: [
        {
          path: geometrySource,
          symbol: district
            ? 'prepareHkgovCenstatdDistrictUpload'
            : quarters
              ? 'prepareHkgovCenstatdStatisticGeographyUploads'
              : had
                ? 'prepareHkgovHadDistrictUpload'
                : 'prepareHkgovPlandNewTownParquet',
        },
        {
          path: 'apps/harbour-cli/src/lib/pipeline/divisions/processLocalDivisionGeometrySqlUpload.ts',
          symbol: 'processLocalDivisionGeometrySqlUpload',
        },
      ],
      steps: district
        ? [
            'Select the registered GML layer by dataset/sourceVersion. Parse native EPSG:2326 surface geometry and project it to EPSG:4326; preserve native geometry and publisher properties separately.',
            'For a profile with referencePeriodField, select features whose property string equals the selected cohortKey. Require 18 unique districts.',
            'district_class = optionalString(properties.dc_class ?? properties.DC_CLASS) ?? ""; district_code = requireInteger(properties.dc ?? properties.DC). id = "CENSTATD:" + (district_class || district_code).',
            'sources initially contains dataset=hkgov-censtatd, districtClass when present, districtCode and optional source archive key/hash.',
            'If the preparation transform is simplified, run withDisplayGeometry across the exact prepared coverage and preserve source geometry/identity. The later upload display transform is a separate stage.',
            'Subdivided units resolve the C&SD administrative identity document for the selected cohort; the other district datasets use cohort 2021. Build a bridge using both externalId and non-empty externalCode as keys.',
            'Use a supplied trimmed division_id when present. Otherwise choose district_class before district_code as bridge key and require a matching canonicalId. Parse JSON source arrays, retain supplied non-empty id or derive CENSTATD:<bridge key>.',
          ]
        : quarters
          ? [
              'Read AREA_LQ_2023.gml using both the statistic archive parser and GML geometry parser; require equal row counts and correlate by member ordinal.',
              'The source feature ID must identify HK, KLN or NT; require non-empty AREA_ENG and AREA_CHI. Map HK/KLN/NT to the Hong Kong Island/Kowloon/New Territories canonical area identities.',
              'id = CENSTATD:area:<code>; division_id is the mapped canonical area ID. geometry is projected WGS84; source_geometry is native EPSG:2326; source_properties are unchanged publisher properties.',
              'sources contains dataset, layerName, sourceArchiveKey, sourceArchiveSha256 and sourceRecordId = layerName + ":" + featureId. Parse these JSON-valued fields during the input-row hand-off.',
            ]
          : had
            ? [
                'Read the DCD district layer, correlate native/projected records by AREA_ID and require unique native identities. Derive WGS84 geometry by projecting the native HK80 geometry; preserve the native geometry.',
                'Require 18 features, unique publisher OBJECTID and non-empty AREA_ID/AREA_CODE/AREA_TYPE. id = HAD:<AREA_ID>; retain original publisher properties and optional archive references.',
                'Resolve the HAD administrative identity curation for the selected cohort (registered cohort 2022); populate bridge keys from externalId and externalCode. Require area_id to map to a canonical Division, and set division_id.',
              ]
            : [
                'Acquire the supported cohort New Town feature collection. Require unique provider IDs, expected feature counts and all English/Traditional/Simplified Chinese names.',
                'Require WGS84 Polygon/MultiPolygon geometry. Keep valid geometry; otherwise apply JSTS buffer(0), require a valid polygonal result and retain originalGeometry separately.',
                'Derive the canonical Division UUID from the retained namespace, sourceVersion and normalised English name. Area id = PLAND:NEWTOWN:<division_id>; newtown_id is the lowercase hyphenated provider name.',
                'Require non-empty newtown_id and division_id during input normalisation. Preserve supplied id, otherwise use PLAND:NEWTOWN:<division_id>. Parse sources or supply the native town source reference.',
              ],
    }
  if (
    [
      'geometry',
      'division_id',
      'id',
      'sources',
      'district_class',
      'district_code',
    ].includes(path)
  )
    return {
      inputs: ['governmentAreaRows'],
      rawArchive: false,
      expression: `Select ${path} from the prepared area row, maintaining the native record identity.`,
      implementation: {
        path: upload,
        symbol: had
          ? 'normaliseHkgovHadInputRow'
          : town
            ? 'normaliseHkgovPlandNewTownInputRow'
            : 'normaliseHkgovCenstatdInputRow',
      },
    }
  return null
}
