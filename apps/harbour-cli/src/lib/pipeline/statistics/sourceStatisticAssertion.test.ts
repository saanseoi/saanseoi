import { expect, test } from 'bun:test'
import { sourceStatisticAssertion } from './sourceStatisticAssertion.ts'

test('source statistic persistence retains raw evidence without canonical preparation fields', () => {
  const rawProperties = { DC: 1, MYPOPN_LAND: '12.3', DISTRICT_EN: 'District' }
  const row = sourceStatisticAssertion({
    sourceRecordId: 'district:1',
    rawProperties,
    sourceGeometry: { type: 'Polygon', coordinates: [] },
    sources: [{ dataset: 'hkgov-censtatd' }],
    version: 1,
    versionHash: 'hash',
    releaseId: 'release',
    validFromRelease: '2024',
    validToRelease: null,
    isCurrent: true,
    createdAt: 'now',
    updatedAt: 'now',
    districtCode: 1,
    districtEn: 'District',
    midYearPopulation: 12300,
    referencePeriodCode: '2024',
    datasetCode: 'dataset',
    layerName: 'layer',
    featureId: '1',
  })
  expect(row.rawProperties).toBe(rawProperties)
  expect(Object.keys(row).sort()).toEqual([
    'createdAt',
    'isCurrent',
    'rawProperties',
    'releaseId',
    'sourceGeometry',
    'sourceLocator',
    'sourceRecordId',
    'updatedAt',
    'validFromRelease',
    'validToRelease',
    'versionHash',
  ])
})
