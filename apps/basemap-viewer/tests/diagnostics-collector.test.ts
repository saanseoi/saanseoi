import { describe, expect, it } from 'vitest'
import { DiagnosticsCollector } from '../src/lib/diagnostics-collector'
import { BASEMAP_SOURCE_ID } from '../src/lib/style'
import type { ViewerDiagnostics } from '../src/diagnostics'

describe('DiagnosticsCollector', () => {
  it('keeps general errors separate from tile failures', async () => {
    let latest: ViewerDiagnostics
    const collector = new DiagnosticsCollector(value => {
      latest = value
    })
    latest = collector.snapshot

    collector.recordError('UI failed')
    collector.record({
      type: 'mapError',
      message: 'glyph failed',
      release: 'primary',
      sourceId: 'glyphs',
    })
    collector.record({
      type: 'mapError',
      message: 'tile failed',
      release: 'primary',
      sourceId: BASEMAP_SOURCE_ID,
    })
    await Promise.resolve()

    expect(latest.errors).toEqual(['UI failed', 'glyph failed', 'tile failed'])
    expect(latest.tileFailures).toBe(1)
  })

  it('counts tile requests and loaded timing samples', async () => {
    let latest: ViewerDiagnostics
    const collector = new DiagnosticsCollector(value => {
      latest = value
    })
    latest = collector.snapshot
    const timing = {
      name: 'https://tiles.example/1.pbf',
      startTime: 10,
      duration: 12,
      transferSize: 100,
      encodedBodySize: 80,
      decodedBodySize: 200,
    } as PerformanceResourceTiming

    collector.record({
      type: 'tileRequested',
      release: 'primary',
      sourceId: BASEMAP_SOURCE_ID,
      key: '1/2/3',
    })
    collector.record({
      type: 'tileLoaded',
      release: 'primary',
      sourceId: BASEMAP_SOURCE_ID,
      key: '1/2/3',
      resourceTimings: [timing],
      tileTimings: [],
    })
    await Promise.resolve()

    expect(latest.tileRequests).toBe(1)
    expect(latest.tileWeight.primary.completedLoads).toBe(1)
    expect(latest.lastTileDurationMs).toBe(12)

    collector.resetTileWeight('primary')
    expect(latest.tileWeight.primary.tileRequests).toBe(0)
    expect(latest.tileWeight.primary.completedLoads).toBe(0)
  })
})
