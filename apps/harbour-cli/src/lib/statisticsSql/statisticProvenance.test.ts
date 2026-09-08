import { expect, test } from 'bun:test'
import {
  apiFieldView,
  readApplications,
  readValue,
  reapplyApplications,
  recordKey,
  type JsonRecord,
  type ProvenanceStore,
} from '@repo/core/provenance'
import { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics'
import { retainStatisticProvenance } from './statisticProvenance'
import type { CenstatdFieldMetadata } from './censtatdMeasureCurationTypes'

test('Statistics retains literal evidence, reviewed definitions and replayable dimension splits', async () => {
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
  const applications = await Array.fromAsync(readApplications(store, result.manifest))
  const application = applications[0]
  if (!application) throw new Error('Expected retained application.')
  const sourceRow = source[0]
  if (!sourceRow) throw new Error('Expected source row.')
  expect(application.effects).toHaveLength(2)
  expect(applications.filter(a => a.decision.origin === 'human')).toHaveLength(2)
  expect(
    apiFieldView(applications).some(f => f.apiField === 'statistic.attributes.values'),
  ).toBe(true)
  const evidence = application.evidence.find(e => e.role.startsWith('guarded-input:'))
  if (!evidence) throw new Error('Expected guarded input evidence.')
  expect(
    await readValue(store, { ...evidence.object, pointer: evidence.pointer }),
  ).toEqual(sourceRow.properties)
  const state = new Map<string, JsonRecord>([
    [
      recordKey({
        collection: 'publisher-properties',
        id: sourceRow.sourceFeatureRef,
      }),
      sourceRow.properties,
    ],
  ])
  // No normaliser or metadata registry is consulted after capture.
  fieldMetadata.clear()
  const replayed = await reapplyApplications(
    store,
    result.manifest.collections,
    state,
    readApplications(store, result.manifest),
  )
  for (const row of canonical.records)
    expect(replayed.get(recordKey({ collection: 'statsRecords', id: row.id }))).toEqual(
      row,
    )
  expect(canonical.records.some(row => row.values.population === '243300')).toBe(true)
  expect(canonical.records.some(row => row.values.withheld === 'suppressed')).toBe(true)
  expect(source).toEqual(before)
  state.set(
    recordKey({ collection: 'publisher-properties', id: sourceRow.sourceFeatureRef }),
    { dc: '12' },
  )
  await expect(
    reapplyApplications(store, result.manifest.collections, state, applications),
  ).rejects.toThrow('Input guard failed')
})
