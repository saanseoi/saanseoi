import profiles from '../../../fixtures/meta/fieldLineage/censtatd-intake-profiles.json'
const generic =
  'apps/harbour-cli/src/lib/sources/hkgov/censtatd/hkgovCenstatdStatistics.ts'
const density =
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'

export function statisticIntakeSpecification(datasetCode: string, path: string) {
  if (path === 'intakeRows')
    return {
      inputs: ['sourceVersion'],
      rawArchive: true,
      implementation: {
        path:
          datasetCode === density
            ? 'apps/harbour-cli/src/lib/sources/hkgov/censtatd/hkgovCenstatdDistrictStatistics.ts'
            : generic,
        symbol:
          datasetCode === density
            ? 'prepareHkgovCenstatdDistrictStatisticUpload'
            : 'readHkgovCenstatdStatisticArchive',
      },
      profiles,
      expression:
        'Parse the selected archive GML members into the prepared row collection in member order.',
      steps:
        datasetCode === density
          ? [
              'Read Density_<sourceVersion>.gml using parseHkgovCenstatdDistrictGml. Supported versions are 2022 and 2024.',
              'Require 18 unique integer DC codes; require PERIOD to match sourceVersion, required district names and valid numeric LA, POPN_D and MYPOPN_LAND.',
              'Preserve publisher properties through JSON serialisation/deserialisation. Scalar diagnostic population conversion does not replace properties.MYPOPN_LAND.',
              'Use sourceFeatureIdentity = "Density:" + districtCode. Retain native source geometry separately from canonical values.',
            ]
          : [
              'Select the retained dataset profile and require a supported sourceVersion. For subdivided units select only the layer whose name contains sourceVersion.slice(2). Require each selected <layer>.gml member.',
              'XMLParser keeps attributes, disables tag-value parsing and trims values. Require FeatureCollection and the expected layer inside featureMember/member.',
              'Strip namespace prefixes from property names; exclude attributes, SHAPE, geometryProperty and boundedBy. Preserve property values.',
              'featureId is gml:id, id, fid, then <layerName>.<one-based member ordinal>. When an ID repeats in a layer, append :<one-based member ordinal> to every occurrence.',
              'Set sourceFeatureIdentity = layerName + ":" + featureId. Reject duplicate qualified identities across the prepared set.',
              'Enforce retained expectedRowCount, required non-empty fields and rowsPerReferencePeriod counts before accepting the rows.',
            ],
      additionalImplementations: [
        { path: generic, symbol: 'parseCsdiGml' },
        {
          path: 'apps/harbour-cli/src/lib/sources/hkgov/censtatd/hkgovCenstatdGml.ts',
          symbol: 'parseHkgovCenstatdDistrictGml',
        },
      ],
    }
  if (path === 'properties' || path === 'sourceFeatureIdentity')
    return {
      inputs: ['intakeRows'],
      rawArchive: false,
      implementation: { path: generic, symbol: 'parseCsdiGml' },
      expression:
        path === 'properties'
          ? 'Select the publisher properties object from the current intake row; decode the density hand-off JSON when needed, without replacing publisher values with diagnostic scalars.'
          : datasetCode === density
            ? '"Density:" + intakeRow.districtCode'
            : 'intakeRow.layerName + ":" + intakeRow.featureId',
    }
  if (path === 'sourceFeatureRef')
    return {
      inputs: ['datasetCode', 'sourceVersion', 'sourceFeatureIdentity'],
      rawArchive: false,
      implementation: {
        path: 'apps/harbour-cli/src/lib/pipeline/statistics/processLocalHkgovCenstatdStatisticSqlUpload.ts',
        symbol: 'processLocalHkgovCenstatdStatisticSqlUpload',
      },
      expression:
        '["hkgov-censtatd", datasetCode, sourceVersion, sourceFeatureIdentity].join("/")',
    }
  return null
}
