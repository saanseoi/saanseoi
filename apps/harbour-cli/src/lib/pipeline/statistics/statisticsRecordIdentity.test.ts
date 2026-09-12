import { expect, test } from 'bun:test'
import {
  hashStatisticContent,
  versionStatisticsDefinitions,
} from './statisticsRecordIdentity.ts'

function definitions() {
  return {
    fields: [
      {
        datasetCode: 'dataset',
        fieldName: 'femalePopulation',
        measureCode: 'population',
        dimensions: { sex: 'female' },
        aggregation: 'total',
        unitCode: 'person',
        sourceReleaseId: 'release',
        createdAt: '2021-01-01',
      },
    ],
    fieldsI18n: [
      {
        datasetCode: 'dataset',
        fieldName: 'femalePopulation',
        locale: 'en',
        name: 'Female population',
      },
    ],
    measures: [{ datasetCode: 'dataset', measureCode: 'population' }],
    measuresI18n: [
      {
        datasetCode: 'dataset',
        measureCode: 'population',
        locale: 'en',
        name: 'Population',
      },
    ],
  }
}

test('definition versions link fields and localisations to exact measure meanings', () => {
  const versioned = versionStatisticsDefinitions(definitions())
  expect(versioned.fields[0]?.measureVersionHash).toBe(
    versioned.measures[0]?.versionHash,
  )
  expect(versioned.fieldsI18n[0]?.versionHash).toBe(versioned.fields[0]?.versionHash)
  expect(versioned.measuresI18n[0]?.versionHash).toBe(
    versioned.measures[0]?.versionHash,
  )
  expect(versioned.fieldDefinitionHashes.get('dataset\0femalePopulation')).toBe(
    versioned.fields[0]?.versionHash,
  )
})

test('publisher reissues, timestamps and object ordering do not create definition versions', () => {
  const original = versionStatisticsDefinitions(definitions())
  const reissue = definitions()
  reissue.fields = reissue.fields.map(field => ({
    ...field,
    sourceReleaseId: 'new-release',
    createdAt: '2026-01-01',
  }))
  const next = versionStatisticsDefinitions(reissue)
  expect(next.fields[0]?.versionHash).toBe(original.fields[0]?.versionHash)
  expect(versionStatisticsDefinitions(next).fields[0]?.versionHash).toBe(
    original.fields[0]?.versionHash,
  )
  expect(hashStatisticContent({ dimensions: { sex: 'female', age: 'all' } })).toBe(
    hashStatisticContent({ dimensions: { age: 'all', sex: 'female' } }),
  )
})

test('field semantics and localisations create versions and measure revisions propagate to fields', () => {
  const original = versionStatisticsDefinitions(definitions())
  const changedDimension = definitions()
  for (const field of changedDimension.fields) field.dimensions.sex = 'all'
  expect(
    versionStatisticsDefinitions(changedDimension).fields[0]?.versionHash,
  ).not.toBe(original.fields[0]?.versionHash)
  const changedFieldName = definitions()
  for (const field of changedFieldName.fieldsI18n)
    field.name = 'Reviewed female population'
  expect(
    versionStatisticsDefinitions(changedFieldName).fields[0]?.versionHash,
  ).not.toBe(original.fields[0]?.versionHash)
  const changedMeasureName = definitions()
  for (const measure of changedMeasureName.measuresI18n)
    measure.name = 'Resident population'
  const revised = versionStatisticsDefinitions(changedMeasureName)
  expect(revised.measures[0]?.versionHash).not.toBe(original.measures[0]?.versionHash)
  expect(revised.fields[0]?.versionHash).not.toBe(original.fields[0]?.versionHash)
})
