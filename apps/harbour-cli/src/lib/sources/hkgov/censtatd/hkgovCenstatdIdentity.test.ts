import { expect, test } from 'bun:test'
import { parseCsdiGml } from './hkgovCenstatdStatistics'
import { loadDatasetFixtures } from '../../sourceUpdatesCatalog'
import { datasetSourceRecordIdentity } from '@repo/core/pipeline/services/sources/datasetSourceRecordIdentity'

const dataset = 'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
const gml = `<FeatureCollection><featureMember><DC_GHS fid="same"><dc>A</dc></DC_GHS></featureMember><featureMember><DC_GHS fid="same"><dc>B</dc></DC_GHS></featureMember><featureMember><DC_GHS><dc>C</dc></DC_GHS></featureMember></FeatureCollection>`

test('native GML intake applies declared collision and missing-ID rules', () => {
  const rows = parseCsdiGml(gml, 'DC_GHS', dataset)
  expect(rows.map(row => row.sourceRecordId)).toEqual(['same:1', 'same:2', '3'])
  expect(rows.map(row => row.properties.dc)).toEqual(['A', 'B', 'C'])
  expect(parseCsdiGml(gml, 'DC_GHS', dataset)).toEqual(rows)
})

test('fixture loading exposes the same identity contracts consumed by producers', async () => {
  const datasets = await loadDatasetFixtures()
  const declared = datasets.filter(dataset => dataset.sourceRecordIdentity)
  expect(declared).toHaveLength(11)
  for (const dataset of declared)
    expect(dataset.sourceRecordIdentity).toEqual(
      datasetSourceRecordIdentity(dataset.code),
    )
})
