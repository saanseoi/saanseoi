import housingMarketAreas from '../../../../../../fixtures/meta/datasets/hkgov-censtatd-hk-housing-market-areas-building-groups.json'
import districtDensity from '../../../../../../fixtures/meta/datasets/hkgov-censtatd-hk-land-area-population-density-district.json'
import majorHousingEstates from '../../../../../../fixtures/meta/datasets/hkgov-censtatd-hk-major-housing-estates.json'
import newTowns from '../../../../../../fixtures/meta/datasets/hkgov-censtatd-hk-new-towns.json'
import districtLivingQuarters from '../../../../../../fixtures/meta/datasets/hkgov-censtatd-hk-permanent-living-quarters-district.json'
import livingQuarters from '../../../../../../fixtures/meta/datasets/hkgov-censtatd-hk-permanent-living-quarters.json'
import districtPopulation from '../../../../../../fixtures/meta/datasets/hkgov-censtatd-hk-population-households-district.json'
import districtSubdividedUnits from '../../../../../../fixtures/meta/datasets/hkgov-censtatd-hk-subdivided-units-district.json'
import hadDistricts from '../../../../../../fixtures/meta/datasets/hkgov-had-hk-division-area-district.json'
import planningUnits from '../../../../../../fixtures/meta/datasets/hkgov-pland-hk-division-pu.json'
import planningNewTowns from '../../../../../../fixtures/meta/datasets/hkgov-pland-hk-division-new-town.json'
import {
  assertSourceRecordIdentity,
  type SourceRecordIdentity,
} from '../../../sourceRecordIdentity'

const datasets = [
  housingMarketAreas,
  districtDensity,
  majorHousingEstates,
  newTowns,
  districtLivingQuarters,
  livingQuarters,
  districtPopulation,
  districtSubdividedUnits,
  hadDistricts,
  planningUnits,
  planningNewTowns,
]
const policies = new Map<string, SourceRecordIdentity>(
  datasets.map(dataset => {
    assertSourceRecordIdentity(dataset.sourceRecordIdentity)
    return [dataset.code, dataset.sourceRecordIdentity]
  }),
)

/** Identity contracts live on publisher dataset fixtures, not canonical recipes. */
export function datasetSourceRecordIdentity(datasetCode: string): SourceRecordIdentity {
  const policy = policies.get(datasetCode)
  if (!policy) throw new Error(`No source-record identity declared for ${datasetCode}.`)
  return policy
}
