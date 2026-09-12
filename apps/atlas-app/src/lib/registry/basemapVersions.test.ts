import { describe, expect, test } from 'bun:test'

import { parseBasemapVersions } from './basemapVersions'

describe('parseBasemapVersions', () => {
  test('validates and orders releases newest first', () => {
    expect(
      parseBasemapVersions([
        { version: '2026-08-01', size: 20, createdAt: 'later' },
        { version: 'invalid', size: 30, createdAt: 'ignored' },
        { version: '2026-09-01', size: 40, createdAt: 'newest' },
      ]),
    ).toEqual([
      { version: '2026-09-01', size: 40, createdAt: 'newest' },
      { version: '2026-08-01', size: 20, createdAt: 'later' },
    ])
  })

  test('rejects non-array responses', () => {
    expect(parseBasemapVersions({ versions: [] })).toEqual([])
  })
})
