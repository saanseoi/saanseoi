import district2016 from '../../../fixtures/meta/curations/identity/dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016.json'
import district2021 from '../../../fixtures/meta/curations/identity/dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2021.json'
import had from '../../../fixtures/meta/curations/identity/dr-hk-hkgov-had-division-area-district-2022.json'
import towns from '../../../fixtures/meta/curations/identity/dr-hk-hkgov-censtatd-division-statistic-new-towns-2021.json'
import hma from '../../../fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-housing-market-areas-building-groups.json'
import estates from '../../../fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-major-housing-estates.json'
import newTowns from '../../../fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-new-towns.json'
import quarters from '../../../fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-permanent-living-quarters.json'
import quartersDistrict from '../../../fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-permanent-living-quarters-district.json'
import households from '../../../fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-population-households-district.json'
import subdivided from '../../../fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-subdivided-units-district.json'
import density from '../../../fixtures/meta/datasets/hkgov-censtatd-hk-division-statistic-land-area-population-density-district.json'

const caller =
  'apps/harbour-cli/src/lib/pipeline/statistics/processLocalHkgovCenstatdStatisticSqlUpload.ts'
const datasets = [
  hma,
  estates,
  newTowns,
  quarters,
  quartersDistrict,
  households,
  subdivided,
  density,
]
export const retainedGovernmentIdentityDocuments = {
  district2016,
  district2021,
  had,
  towns,
}

export function statisticContextSpecification(datasetCode: string, path: string) {
  const dataset = datasets.find(entry => entry.code === datasetCode)
  if (!dataset) return null
  const base = {
    implementation: {
      path: caller,
      symbol: 'processLocalHkgovCenstatdStatisticSqlUpload',
    },
  }
  if (path === 'areaCompanionByReferencePeriod')
    return {
      ...base,
      inputs: [],
      expression:
        'Use the retained selected dataset areaCompanionByReferencePeriod configuration, or undefined when it is absent.',
      datasetVersionHash: dataset.versionHash,
      mapping:
        'areaCompanionByReferencePeriod' in dataset
          ? dataset.areaCompanionByReferencePeriod
          : null,
    }
  if (path === 'divisionIdentityBridge')
    return {
      implementation: {
        path: 'apps/harbour-cli/src/lib/pipeline/statistics/censtatdDistrictBridge.ts',
        symbol: 'resolveCenstatdDistrictBridgeCohort',
      },
      inputs: ['sourceVersion'],
      documents: retainedGovernmentIdentityDocuments,
      expression:
        'Select the reviewed identity bridge by dataset and sourceVersion; never choose the latest mapping.',
      steps: [
        'Population/household, district living quarters and density datasets select C&SD administrative cohort 2021. Subdivided units select sourceVersion, requiring 2016 or 2021. New Towns require sourceVersion 2021 and the new-town mapping. Other datasets have no district/New Town bridge.',
        'Validate reviewed document hashes, require one matching resourceType=division, authority, cohortKey and domain; require non-empty unique externalId and non-empty canonicalId.',
        'For district mappings, join C&SD canonicalId to HAD 2022 canonicalId. HAD externalCode must be a recognised Hong Kong district code. Convert C&SD externalCode to a safe integer; reject duplicates or missing HAD matches.',
        'Require all 18 district codes exactly once. New Towns map externalId to canonicalId and require 13 unique entries.',
      ],
      additionalImplementations: [
        {
          path: 'libs/core/src/pipeline/services/divisions/districtIdentity.ts',
          symbol: 'createHkgovCenstatdDistrictResolution',
        },
        {
          path: 'apps/harbour-cli/src/lib/identityCurations.ts',
          symbol: 'resolveIdentityCurationInternal',
        },
        {
          path: 'apps/harbour-cli/src/lib/pipeline/statistics/censtatdDistrictBridge.ts',
          symbol: 'createHkgovCenstatdNewTownResolution',
        },
      ],
    }
  if (path === 'geographyOverride')
    return {
      ...base,
      inputs: ['properties', 'divisionIdentityBridge'],
      expression:
        'For a district bridge, resolve Number(properties.DC ?? properties.dc), requiring a string/number integer code, and return {code: resolved.districtCode, kind:"district"}; otherwise undefined.',
      implementation: { path: caller, symbol: 'geographyForSourceProperties' },
    }
  if (path === 'statisticDivisionId')
    return {
      ...base,
      inputs: ['properties', 'sourceFeatureIdentity', 'divisionIdentityBridge'],
      expression:
        'divisionIdForSourceProperties(datasetCode, properties, sourceFeatureIdentity, districtBridge, newTownBridge)',
      steps: [
        'Permanent living quarters maps the suffix after the final : in the feature identity to HK/KLN/NT through hkgovCenstatdStatisticDivisionId.',
        'HMA/Building Groups maps only HMA_21C: features using string properties.hma. Building Group rows have no canonical Division association.',
        'New Towns maps only NewTown_21C: features using trimmed string properties.newtown and the reviewed New Town bridge.',
        'District datasets use Number(properties.DC ?? properties.dc) to look up the selected district bridge. Other unassociated geographies return null.',
        'When a district or New Town bridge is required, a missing Division association is an ingestion error.',
      ],
      implementation: { path: caller, symbol: 'divisionIdForSourceProperties' },
      additionalImplementations: [
        {
          path: 'apps/harbour-cli/src/lib/sources/hkgov/censtatd/hkgovCenstatdStatistics.ts',
          symbol: 'hkgovCenstatdStatisticDivisionId',
        },
      ],
    }
  return null
}
