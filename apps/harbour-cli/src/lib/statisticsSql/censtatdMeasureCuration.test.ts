import { expect, test } from 'bun:test'

import {
  emptyCenstatdMeasureCuration,
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
