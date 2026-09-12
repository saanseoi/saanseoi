import { describe, expect, test } from 'bun:test'

import { auditScrollHasMore, nextAuditScrollPage } from './auditScroll'

describe('audit scroll paging', () => {
  test('advances by one visible height', () => {
    expect(
      nextAuditScrollPage({ clientHeight: 640, scrollHeight: 2_000, scrollTop: 120 }),
    ).toBe(760)
  })

  test('stops at the final scroll position', () => {
    expect(
      nextAuditScrollPage({ clientHeight: 640, scrollHeight: 1_500, scrollTop: 700 }),
    ).toBe(860)
  })

  test('only reports more content while the viewport is clipped', () => {
    expect(
      auditScrollHasMore({ clientHeight: 640, scrollHeight: 1_500, scrollTop: 0 }),
    ).toBe(true)
    expect(
      auditScrollHasMore({ clientHeight: 640, scrollHeight: 1_500, scrollTop: 860 }),
    ).toBe(false)
  })
})
