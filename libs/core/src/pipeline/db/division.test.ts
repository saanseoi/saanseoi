import { expect, test } from 'bun:test'

import { getDivisionCurrentSnapshotTraceState } from './division'

test('batches large Division trace lookups within D1 variable limits', async () => {
  let allCalls = 0
  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                groupBy() {
                  return {
                    all: async () => {
                      allCalls += 1
                      return []
                    },
                  }
                },
                all: async () => {
                  allCalls += 1
                  return []
                },
              }
            },
          }
        },
      }
    },
  }
  const divisionIds = Array.from({ length: 101 }, (_, index) => `division-${index}`)

  const traceState = await getDivisionCurrentSnapshotTraceState(
    db as never,
    'snapshot-1',
    divisionIds,
  )

  expect(allCalls).toBe(4)
  expect(traceState.size).toBe(101)
})
