import { expect, test } from 'bun:test'

import { listStatisticFieldDefinitions } from './statistics.ts'

test('batches every dynamic dictionary filter below D1 variable limits', async () => {
  let queryCount = 0
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              queryCount += 1
              return { all: () => [] }
            },
          }
        },
      }
    },
  } as never
  const values = Array.from({ length: 61 }, (_, index) => String(index))

  const definitions = await listStatisticFieldDefinitions([db], {
    datasetCodes: values.map(value => `dataset-${value}`),
    localeSelection: {
      mode: 'requested',
      locales: values.map(value => `en-${value}`),
    },
    sourceReleaseIds: values.map(value => `release-${value}`),
  })

  expect(definitions).toEqual([])
  expect(queryCount).toBe(36)
})
