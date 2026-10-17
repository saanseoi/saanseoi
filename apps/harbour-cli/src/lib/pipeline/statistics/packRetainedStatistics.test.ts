import { expect, test } from 'bun:test'
import { compactStatisticFieldSources, expandStatisticFieldSources } from '@repo/db'
import { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics'
import { packRetainedStatistics } from './packRetainedStatistics'

const datasetCode = 'ds-hk-hkgov-censtatd-population-households-district'
const source = (feature: string, properties: Record<string, string>) => ({
  datasetCode,
  sourceReleaseId: `${feature}-release`,
  sourceFeatureRef: feature,
  sourceVersion: '2021',
  divisionId: 'division',
  properties: { dc: '11', dc_class: 'A', year: '2021', ...properties },
})
test('retained repacking preserves every field source across features and releases', () => {
  const canonical = normaliseHkgovCenstatdStatistics([
    source('a', { population: '100' }),
    source('b', { households: '20' }),
  ])
  const result = packRetainedStatistics({
    ...canonical,
    records: canonical.records,
    sourceProperties: () => {
      throw new Error('District identity already resolved')
    },
  })
  expect(result.canonical.records).toHaveLength(1)
  const record = result.canonical.records[0]!
  expect(record).not.toHaveProperty('sourceFeatureRef')
  expect(record.id).toBe(canonical.records[0]!.id)
  expect(record.fieldSources).toEqual(canonical.records[0]!.fieldSources)
  expect(
    expandStatisticFieldSources(record.fieldSources, Object.keys(record.values)),
  ).toEqual({
    population: { sourceReleaseId: 'a-release', sourceFeatureRef: 'a' },
    households: { sourceReleaseId: 'b-release', sourceFeatureRef: 'b' },
  })
  expect(() =>
    packRetainedStatistics({
      ...canonical,
      records: [{ ...canonical.records[0], fieldSources: [] }],
      sourceProperties: () => {
        throw new Error('unused')
      },
    }),
  ).toThrow('Missing statistic field source')
})
test('geography recovery resolves each contributing release and feature, and rejects conflicts', () => {
  const canonical = normaliseHkgovCenstatdStatistics([
    source('a', { population: '100', households: '20' }),
  ])
  const sources = compactStatisticFieldSources({
    population: { sourceReleaseId: 'old', sourceFeatureRef: 'old-feature' },
    households: { sourceReleaseId: 'new', sourceFeatureRef: 'new-feature' },
  })
  const record = {
    ...canonical.records[0]!,
    datasetCode: 'ds-hk-hkgov-censtatd-housing-market-areas-building-groups',
    geography: {
      kind: 'building-group',
      code: '01',
      class: 'A',
      namespace: 'housing-market-area:01',
    },
    fieldSources: sources,
  }
  const input = {
    ...canonical,
    fields: canonical.fields.map(f => ({ ...f, datasetCode: record.datasetCode })),
    measures: canonical.measures.map(f => ({ ...f, datasetCode: record.datasetCode })),
    fieldsI18n: [],
    measuresI18n: [],
    records: [record],
  }
  const visited: string[] = []
  packRetainedStatistics({
    ...input,
    sourceProperties: source => {
      visited.push(`${source.sourceReleaseId}/${source.sourceFeatureRef}`)
      return { sourceVersion: '2021', properties: { hma: '01', bg: '01', bg_ind: 'A' } }
    },
  })
  expect(visited.sort()).toEqual(['new/new-feature', 'old/old-feature'])
  expect(() =>
    packRetainedStatistics({
      ...input,
      sourceProperties: source => ({
        sourceVersion: '2021',
        properties: {
          hma: source.sourceReleaseId === 'new' ? '02' : '01',
          bg: '01',
          bg_ind: 'A',
        },
      }),
    }),
  ).toThrow('Retained geography disagrees')
})
