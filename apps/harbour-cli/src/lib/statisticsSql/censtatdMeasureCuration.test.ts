import { expect, test } from 'bun:test'

import {
  emptyCenstatdMeasureCuration,
  parseCsdiSimplifiedDataSpecification,
  resolveCenstatdMeasureCuration,
  suggestMeasureName,
} from './censtatdMeasureCuration.ts'

test('identifies C&SD measure fields that require a reviewed decision', () => {
  const measure = {
    datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
    sourceField: 'TOTAL',
    unitCode: 'publisher-unknown',
    valueKind: 'numeric',
  }
  const unresolved = resolveCenstatdMeasureCuration({
    manifest: emptyCenstatdMeasureCuration(),
    measures: [measure],
  })
  expect(unresolved.unresolved).toEqual([measure])

  const resolved = resolveCenstatdMeasureCuration({
    manifest: {
      measures: [
        {
          datasetCode: measure.datasetCode,
          localisations: [
            {
              description: 'Total publisher count.',
              isTranslationVerified: true,
              locale: 'en',
              name: 'Total',
            },
          ],
          sourceField: measure.sourceField,
          unitCode: 'person',
        },
      ],
      schemaVersion: 2,
    },
    measures: [measure],
  })
  expect(resolved.unresolved).toEqual([])
  expect(
    resolved.metadata.get(`${measure.datasetCode}\u0000${measure.sourceField}`),
  ).toEqual({
    localisations: [
      {
        description: 'Total publisher count.',
        isTranslationVerified: true,
        locale: 'en',
        name: 'Total',
      },
    ],
    unitCode: 'person',
  })
})

test('parses field definitions from a CSDI simplified data specification', () => {
  const fields = parseCsdiSimplifiedDataSpecification(
    `<table>
      <tr><td>Field Name / 資料欄名稱</td><td>Data Type</td><td>Null Option</td><td>Description</td><td>描述(繁體中文)</td><td>描述(简体中文)</td></tr>
      <tr><td>t_pop</td><td>String</td><td>Null</td><td>Total population</td><td>總人口</td><td>总人口</td></tr>
      <tr><td>hma</td><td>String</td><td>Null</td><td>Housing Market Area</td><td>樓市片區</td><td>楼市片区</td></tr>
    </table>`,
  )

  expect(fields).toEqual([
    expect.objectContaining({
      dataType: 'String',
      descriptionEn: 'Total population',
      descriptionZhHans: '总人口',
      descriptionZhHant: '總人口',
      nullOption: 'Null',
      sourceField: 't_pop',
    }),
    expect.objectContaining({
      descriptionEn: 'Housing Market Area',
      sourceField: 'hma',
    }),
  ])
  expect(fields[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
})

test('keeps a CSDI field eligible when a publisher locale is absent', () => {
  const [field] = parseCsdiSimplifiedDataSpecification(
    `<table>
      <tr><td>Field Name</td><td>Data Type</td><td>Null Option</td><td>Description</td><td>描述(繁體中文)</td><td>描述(简体中文)</td></tr>
      <tr><td>value</td><td>String</td><td>Null</td><td>Value</td><td></td><td>值</td></tr>
    </table>`,
  )

  expect(field).toEqual(
    expect.objectContaining({
      descriptionEn: 'Value',
      descriptionZhHans: '值',
      descriptionZhHant: null,
    }),
  )
})

test('suggests stable camelCase names from publisher descriptions', () => {
  expect(suggestMeasureName('Land Area (sq. km)')).toBe('landArea')
  expect(suggestMeasureName("Mid-year Population ('000)")).toBe('populationMidYear')
  expect(suggestMeasureName('Population Density (Persons per sq. km)')).toBe(
    'populationDensity',
  )
})
