import { describe, expect, it } from 'vitest'
import { createRenderingMode } from '../src/lib/rendering-mode'

describe('rendering mode', () => {
  it('keeps postcard camera policy out of the viewer controller', () => {
    const mode = createRenderingMode('?headless=true&render=postcard-lit')

    expect(mode.headless).toBe(true)
    expect(mode.postcard).toBe(true)
    expect(mode.illuminated).toBe(true)
    expect(mode.bounds('hk')).toEqual([113.82, 22.14, 114.48, 22.58])
    expect(mode.bearing('mo')).toBe(90)
    expect(mode.bounds('xx')).toBeNull()
    expect(mode.bearing('xx')).toBe(0)
    expect(mode.offset('xx')).toEqual([0, 0])
    expect(mode.zoomAdjustment('mo')).toBe(0.7)
    expect(mode.zoomAdjustment('xx')).toBe(0)
  })

  it('uses ordinary rendering defaults without headless mode', () => {
    const mode = createRenderingMode('?render=postcard')

    expect(mode.headless).toBe(false)
    expect(mode.postcard).toBe(false)
    expect(mode.bounds('hk')).toBeNull()
    expect(mode.bearing('hk')).toBe(0)
  })
})
