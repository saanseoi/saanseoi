import { describe, expect, it } from 'vitest'
import { DiagnosticsCollector } from '../src/lib/diagnostics-collector'

describe('DiagnosticsCollector', () => {
  it('keeps general errors separate from tile failures', () => {
    let latest = new DiagnosticsCollector(() => undefined).snapshot
    const collector = new DiagnosticsCollector(value => {
      latest = value
    })

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
      sourceId: 'basemap',
    })

    expect(latest.errors).toEqual(['UI failed', 'glyph failed', 'tile failed'])
    expect(latest.tileFailures).toBe(1)
  })
})
