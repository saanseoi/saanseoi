import { describe, expect, it } from 'vitest'
import {
  isSameRelease,
  orderComparisonReleases,
  resolveReleaseVersion,
} from '../src/lib/release-order'

describe('comparison release order', () => {
  const versions = ['2026-08-01', '2026-02-01', '2025-01-02']

  it('orders explicitly selected releases from oldest to newest', () => {
    expect(orderComparisonReleases('2026-08-01', '2025-01-02', versions)).toEqual({
      oldest: 'comparison',
      newest: 'primary',
    })
  })

  it('resolves latest before ordering selected releases', () => {
    expect(orderComparisonReleases('2025-01-02', 'latest', versions)).toEqual({
      oldest: 'primary',
      newest: 'comparison',
    })
  })

  it('recognises a dated release and Latest as the same release', () => {
    expect(resolveReleaseVersion('latest', versions)).toBe('2026-08-01')
    expect(isSameRelease('2026-08-01', 'latest', versions)).toBe(true)
  })
})
