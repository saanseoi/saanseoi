export const DEFAULT_TILE_WEIGHT_SAMPLE_LIMIT = 200

export type BasemapTileSource = 'basemap' | 'basemap-labels'

export type TileTimingRecord = {
  identity: string
  source: BasemapTileSource
  tile: string | null
  url: string
  durationMs: number | null
  transferBytes: number | null
  encodedBodyBytes: number | null
  decodedBodyBytes: number | null
}

export type TileWeightLargestTile = Pick<
  TileTimingRecord,
  'source' | 'tile' | 'url' | 'transferBytes' | 'decodedBodyBytes' | 'durationMs'
>

export type TileWeightSummary = {
  tileRequests: number
  completedLoads: number
  failedLoads: number
  normalBasemapRequests: number
  labelOnlyRequests: number
  totalTransferBytes: number | null
  totalEncodedBodyBytes: number | null
  totalDecodedBodyBytes: number | null
  meanDurationMs: number | null
  p95DurationMs: number | null
  meanTransferBytes: number | null
  p95TransferBytes: number | null
  largestTile: TileWeightLargestTile | null
}

export interface TileWeightCollection {
  recordRequest(source: BasemapTileSource): void
  recordFailure(): void
  add(record: TileTimingRecord): boolean
  reset(): void
  summary(): TileWeightSummary
}

const available = (value: number | null): value is number => value !== null
type NumericTimingKey =
  | 'durationMs'
  | 'transferBytes'
  | 'encodedBodyBytes'
  | 'decodedBodyBytes'

function total(
  records: readonly TileTimingRecord[],
  key: NumericTimingKey,
): number | null {
  const values = records.map(record => record[key]).filter(available)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

function mean(
  records: readonly TileTimingRecord[],
  key: NumericTimingKey,
): number | null {
  const values = records.map(record => record[key]).filter(available)
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null
}

function p95(
  records: readonly TileTimingRecord[],
  key: NumericTimingKey,
): number | null {
  const values = records
    .map(record => record[key])
    .filter(available)
    .sort((left, right) => left - right)
  return values.at(Math.ceil(values.length * 0.95) - 1) ?? null
}

function largestTile(
  records: readonly TileTimingRecord[],
): TileWeightLargestTile | null {
  let largest: TileTimingRecord | null = null
  let largestBytes = -1
  for (const record of records) {
    const bytes = record.decodedBodyBytes ?? record.transferBytes
    if (bytes === null || bytes <= largestBytes) continue
    largest = record
    largestBytes = bytes
  }
  if (!largest) return null
  return {
    source: largest.source,
    tile: largest.tile,
    url: largest.url,
    transferBytes: largest.transferBytes,
    decodedBodyBytes: largest.decodedBodyBytes,
    durationMs: largest.durationMs,
  }
}

/**
 * Keeps browser Resource Timing entries small enough for a diagnostics panel,
 * while retaining only the identities needed to reject repeated MapLibre events.
 */
export function createTileWeightCollection(
  limit = DEFAULT_TILE_WEIGHT_SAMPLE_LIMIT,
): TileWeightCollection {
  const records: TileTimingRecord[] = []
  const identities = new Set<string>()
  let tileRequests = 0
  let failedLoads = 0
  let normalBasemapRequests = 0
  let labelOnlyRequests = 0

  return {
    recordRequest(source) {
      tileRequests += 1
      if (source === 'basemap') normalBasemapRequests += 1
      else labelOnlyRequests += 1
    },
    recordFailure() {
      failedLoads += 1
    },
    add(record) {
      if (identities.has(record.identity)) return false
      records.push(record)
      identities.add(record.identity)
      if (records.length > limit) identities.delete(records.shift()?.identity ?? '')
      return true
    },
    reset() {
      records.length = 0
      identities.clear()
      tileRequests = 0
      failedLoads = 0
      normalBasemapRequests = 0
      labelOnlyRequests = 0
    },
    summary() {
      return {
        tileRequests,
        completedLoads: records.length,
        failedLoads,
        normalBasemapRequests,
        labelOnlyRequests,
        totalTransferBytes: total(records, 'transferBytes'),
        totalEncodedBodyBytes: total(records, 'encodedBodyBytes'),
        totalDecodedBodyBytes: total(records, 'decodedBodyBytes'),
        meanDurationMs: mean(records, 'durationMs'),
        p95DurationMs: p95(records, 'durationMs'),
        meanTransferBytes: mean(records, 'transferBytes'),
        p95TransferBytes: p95(records, 'transferBytes'),
        largestTile: largestTile(records),
      }
    },
  }
}

export function knownTimingBytes(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function knownTimingDuration(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
}
