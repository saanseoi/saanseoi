import { readObject, type ProvenanceStore } from '@repo/core/provenance'
import { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics'
import { retainStatisticProvenance } from './statisticProvenance'
import type { CenstatdFieldMetadata } from './censtatdMeasureCurationTypes'

test('Statistics retains bulk counts and reviewed definitions without source or canonical row values', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const datasetCode =
    'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
  const source = [
    {
      datasetCode,
      sourceReleaseId: 'release',
      sourceVersion: '2026',
      sourceFeatureRef: 'DC_GHS:11-2016',
      properties: {
        dc: '11',
        year: '2016',
        MYPOPN_LAND: '243.3',
        missing: null,
        withheld: '**',
      },
    },
  ]
  const fieldMetadata = new Map<string, CenstatdFieldMetadata>([
    [
      `${datasetCode}\u0000MYPOPN_LAND`,
      {
        fieldName: 'population',
        measureCode: 'population',
        dimensions: { sex: 'all' },
        aggregation: 'total',
        statisticKind: 'quantity',
        unitCode: 'person',
        localisations: [],
      },
    ],
    [
      `${datasetCode}\u0000withheld`,
      {
        fieldName: 'withheld',
        measureCode: 'withheld',
        dimensions: { sex: 'female' },
        aggregation: 'total',
        statisticKind: 'quantity',
        unitCode: 'person',
        localisations: [],
      },
    ],
  ])
  const canonical = normaliseHkgovCenstatdStatistics(source, { fieldMetadata })
  const before = structuredClone(source)
  const result = await retainStatisticProvenance(store, {
    releaseId: 'release',
    datasetCode,
    source,
    canonical,
    fieldMetadata,
  })
  expect(result.manifest.kind).toBe('processing-audit')
  expect(result.manifest.applicationCount).toBe(0)
  expect(result.manifest.chunks).toEqual([])
  expect(
    result.manifest.bulk.find(b => b.id === 'normalise-censtatd-statistics')?.counts,
  ).toMatchObject({
    inputs: { 'publisher-properties': 1 },
    outputs: { statsRecords: 2 },
    recordsAffected: 1,
  })
  const retained = [...objects.values()].map(bytes =>
    JSON.parse(new TextDecoder().decode(bytes)),
  )
  expect(retained.some(value => value.kind === 'processing-values')).toBe(false)
  const serialised = JSON.stringify(retained)
  expect(serialised).not.toContain('243.3')
  expect(serialised).not.toContain('243300')
  expect(serialised).not.toContain('DC_GHS:11-2016')
  const fieldRule = result.manifest.bulk.find(b => b.basis === 'fixture')!
  const fixture = await readObject(store, fieldRule.fixtures[0]!.object)
  expect(fixture).toMatchObject({
    kind: 'statistic-field-curations',
    fields: expect.any(Array),
  })
  expect(canonical.records.some(row => row.values.population === '243300')).toBe(true)
  expect(source).toEqual(before)
})
