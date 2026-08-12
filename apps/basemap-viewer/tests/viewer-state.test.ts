import { describe, expect, it } from 'vitest'
import { defaultState } from '../src/lib/ctx/app'
import { reduceViewerState } from '../src/lib/viewer-state'

describe('viewer state transitions', () => {
  it('returns immutable nested state for visibility changes', () => {
    const state = defaultState()
    const next = reduceViewerState(state, {
      type: 'setFeature',
      key: 'roads',
      enabled: false,
    })

    expect(next.features.roads).toBe(false)
    expect(state.features.roads).toBe(true)
    expect(next.features).not.toBe(state.features)
    expect(next.labels).toBe(state.labels)
  })

  it('updates release selection as one transition', () => {
    const state = defaultState()
    const next = reduceViewerState(state, {
      type: 'setReleaseSelection',
      version: '2026-01-01',
      comparisonVersion: '2025-01-01',
    })

    expect(next).toMatchObject({
      version: '2026-01-01',
      comparisonVersion: '2025-01-01',
    })
    expect(state.version).toBe('latest')
  })
})
