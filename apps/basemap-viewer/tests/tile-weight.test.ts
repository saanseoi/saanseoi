import { describe, expect, it } from 'vitest'
import {
  createTileWeightCollection,
  knownTimingBytes,
  type TileTimingRecord,
} from '../src/lib/tile-weight'

function record(
  identity: string,
  changes: Partial<TileTimingRecord> = {},
): TileTimingRecord {
  return {
    identity,
    source: 'basemap',
    tile: '12/1/2',
    url: `https://tiles.example/${identity}.mvt`,
    durationMs: 10,
    transferBytes: 100,
    encodedBodyBytes: 80,
    decodedBodyBytes: 200,
    ...changes,
  }
}

describe('tile-weight collection', () => {
  it('normalises absent and zero browser byte fields to unavailable', () => {
    expect(knownTimingBytes(undefined)).toBeNull()
    expect(knownTimingBytes(0)).toBeNull()
    expect(knownTimingBytes(1)).toBe(1)
  })

  it('keeps unavailable byte fields out of totals and averages', () => {
    const collection = createTileWeightCollection()
    collection.add(
      record('cached', {
        transferBytes: null,
        encodedBodyBytes: null,
        decodedBodyBytes: null,
      }),
    )

    expect(collection.summary()).toMatchObject({
      completedLoads: 1,
      totalTransferBytes: null,
      totalEncodedBodyBytes: null,
      totalDecodedBodyBytes: null,
      meanTransferBytes: null,
      p95TransferBytes: null,
      largestTile: null,
    })
  })

  it('calculates totals, means, p95 values, and the largest tile', () => {
    const collection = createTileWeightCollection()
    collection.add(
      record('one', { durationMs: 10, transferBytes: 100, decodedBodyBytes: 500 }),
    )
    collection.add(
      record('two', { durationMs: 20, transferBytes: 200, decodedBodyBytes: 900 }),
    )
    collection.add(
      record('three', { durationMs: 30, transferBytes: 300, decodedBodyBytes: 700 }),
    )

    expect(collection.summary()).toMatchObject({
      totalTransferBytes: 600,
      totalEncodedBodyBytes: 240,
      totalDecodedBodyBytes: 2100,
      meanDurationMs: 20,
      p95DurationMs: 30,
      meanTransferBytes: 200,
      p95TransferBytes: 300,
      largestTile: {
        tile: '12/1/2',
        url: 'https://tiles.example/two.mvt',
        source: 'basemap',
        transferBytes: 200,
        decodedBodyBytes: 900,
        durationMs: 20,
      },
    })
  })

  it('deduplicates repeated MapLibre timing entries', () => {
    const collection = createTileWeightCollection()
    expect(collection.add(record('same'))).toBe(true)
    expect(collection.add(record('same', { transferBytes: 999 }))).toBe(false)
    expect(collection.summary().completedLoads).toBe(1)
    expect(collection.summary().totalTransferBytes).toBe(100)
  })

  it('retains only the configured rolling window', () => {
    const collection = createTileWeightCollection(2)
    collection.add(record('one', { transferBytes: 100 }))
    collection.add(record('two', { transferBytes: 200 }))
    collection.add(record('three', { transferBytes: 300 }))

    expect(collection.summary()).toMatchObject({
      completedLoads: 2,
      totalTransferBytes: 500,
    })
  })

  it('counts requests and failures', () => {
    const collection = createTileWeightCollection()
    collection.recordRequest()
    collection.recordRequest()
    collection.recordRequest()
    collection.recordFailure()

    expect(collection.summary()).toMatchObject({
      tileRequests: 3,
      failedLoads: 1,
    })
  })

  it('keeps primary and comparison collections independent', () => {
    const primary = createTileWeightCollection()
    const comparison = createTileWeightCollection()
    primary.recordRequest()
    primary.add(record('primary'))
    comparison.recordRequest()
    comparison.add(record('comparison', { transferBytes: 300 }))

    expect(primary.summary()).toMatchObject({
      tileRequests: 1,
      totalTransferBytes: 100,
    })
    expect(comparison.summary()).toMatchObject({
      tileRequests: 1,
      totalTransferBytes: 300,
    })
  })
})
