import { describe, expect, test } from 'bun:test'

import { isReleaseId } from './releases'

describe('isReleaseId', () => {
  test('matches UUID release identifiers and rejects release codes', () => {
    expect(isReleaseId('1ab6a8d2-5ec6-4faa-bd89-c0b3021bba70')).toBe(true)
    expect(isReleaseId('overture-hk-2025-09-24.0-division')).toBe(false)
  })
})
