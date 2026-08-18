import { expect, test } from 'bun:test'

import {
  emptyCenstatdMeasureCuration,
  parseCsdiSimplifiedDataSpecification,
  resolveCenstatdMeasureCuration,
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
          definition: 'Total publisher count.',
          name: 'Total',
          sourceField: measure.sourceField,
          unitCode: 'person',
        },
      ],
      schemaVersion: 1,
    },
    measures: [measure],
  })
  expect(resolved.unresolved).toEqual([])
  expect(
    resolved.metadata.get(`${measure.datasetCode}\u0000${measure.sourceField}`),
  ).toEqual({
    definition: 'Total publisher count.',
    name: 'Total',
    unitCode: 'person',
  })
})

test('parses field definitions from a CSDI simplified data specification', () => {
  const fields = parseCsdiSimplifiedDataSpecification(
    `<table>
      <tr><td>Field Name / 資料欄名稱</td><td>Data Type</td><td>Null Option</td><td>Description</td></tr>
      <tr><td>t_pop</td><td>String</td><td>Null</td><td>Total population</td></tr>
      <tr><td>hma</td><td>String</td><td>Null</td><td>Housing Market Area</td></tr>
    </table>`,
  )

  expect(fields).toEqual([
    expect.objectContaining({
      description: 'Total population',
      sourceField: 't_pop',
    }),
    expect.objectContaining({
      description: 'Housing Market Area',
      sourceField: 'hma',
    }),
  ])
  expect(fields[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
})
