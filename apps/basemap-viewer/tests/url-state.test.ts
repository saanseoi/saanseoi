import { describe, expect, it } from 'vitest'
import { readUrlState, writeUrlState } from '../src/lib/url-state'

describe('URL state', () => {
  it('round trips a dated release and camera', () => {
    const state = readUrlState(
      '?region=hk&version=2026-03-18&theme=dark&locale=zh-Hant&features=roads,buildings,boundaries&labels=places,roads,water&lng=114.169&lat=22.319&z=11.4&bearing=0&pitch=0',
    )
    expect(state).toMatchObject({
      regionCode: 'hk',
      version: '2026-03-18',
      theme: 'dark',
      locale: 'zh-Hant',
    })
    expect(readUrlState(writeUrlState(state))).toEqual(state)
  })

  it('round trips an optional comparison release', () => {
    const state = readUrlState('?region=hk&version=2026-07-31&compare=2026-03-18')
    expect(state.comparisonVersion).toBe('2026-03-18')
    expect(writeUrlState(state)).toContain('compare=2026-03-18')
  })

  it('preserves the overlay comparison presentation', () => {
    const state = readUrlState('?compare=2026-03-18&compareMode=overlay')
    expect(state.comparisonMode).toBe('overlay')
    expect(writeUrlState(state)).toContain('compareMode=overlay')
  })

  it('preserves the side-by-side comparison presentation', () => {
    const state = readUrlState('?compare=2026-03-18&compareMode=side-by-side')
    expect(state.comparisonMode).toBe('side-by-side')
    expect(writeUrlState(state)).toContain('compareMode=side-by-side')
  })

  it('preserves the differences comparison presentation', () => {
    const state = readUrlState('?compare=2026-03-18&compareMode=diff')
    expect(state.comparisonMode).toBe('diff')
    expect(writeUrlState(state)).toContain('compareMode=diff')
  })

  it('reads the Midnight theme from a shared URL', () => {
    expect(readUrlState('?theme=midnight').theme).toBe('midnight')
  })

  it('uses the system theme only when a shared URL does not specify one', () => {
    expect(readUrlState('', 'dark').theme).toBe('dark')
    expect(readUrlState('?theme=light', 'dark').theme).toBe('light')
  })

  it('uses the preferred locale only when a shared URL does not specify one', () => {
    expect(readUrlState('', 'light', 'zh-Hant').locale).toBe('zh-Hant')
    expect(readUrlState('?locale=en', 'light', 'zh-Hant').locale).toBe('en')
  })

  it('reads the diagnostic panel setting', () => {
    const state = readUrlState('?diagnostics=true')

    expect(state.diagnosticsOpen).toBe(true)
    expect(writeUrlState(state)).toContain('diagnostics=true')
  })

  it('uses closed diagnostics for an invalid setting', () => {
    const state = readUrlState('?diagnostics=yes')

    expect(state.diagnosticsOpen).toBe(false)
  })

  it('ignores invalid parameters', () => {
    const state = readUrlState(
      '?region=NOPE!&version=raw.pmtiles&theme=sepia&locale=old_name&features=roads,unknown&labels=unknown&lng=bad',
    )
    expect(state.regionCode).toBeNull()
    expect(state.version).toBe('latest')
    expect(state.theme).toBe('light')
    expect(state.locale).toBe('en')
    expect(state.features).toMatchObject({ roads: true, buildings: false })
    expect(state.labels).toMatchObject({
      places: false,
      roads: false,
      pois: false,
      water: false,
    })
    expect(state.camera).toBeNull()
  })
})
