import { describe, expect, test } from 'bun:test'

import {
  classifyHkgovAlsBlockHouseTowerManualReview,
  parseHkgovAlsManualRetainIdReview,
} from './hkgovAlsManualReview.ts'

const candidate = {
  current: {
    continuityKey: 'continuity',
    id: 'current',
    identityKey: 'current',
    sourceVersion: '2025-02-25.1050',
    summary: { csuId: '123T', geoAddress: '456T' },
  },
  previous: {
    continuityKey: 'continuity',
    id: 'previous',
    identityKey: 'previous',
    sourceVersion: '2025-01-23.1031',
    summary: { csuId: '123T', geoAddress: '456T' },
  },
} as never

describe('manual ALS block/house/tower review', () => {
  test('matches retain choices by release and ALS identifiers, not display text', () => {
    const entries = parseHkgovAlsManualRetainIdReview(`
| 2025-02-25.1050
SOME FORMATTING · 1 EXAMPLE ROAD · 123T · 456T
OTHER FORMATTING · 1 EXAMPLE ROAD · 123T · 456T
Building name: OLD → NEW |
`)
    expect(classifyHkgovAlsBlockHouseTowerManualReview([candidate], entries)).toEqual({
      newId: [],
      retainId: [candidate],
      unmatchedRetainEntries: [],
    })
  })

  test('treats a reviewed candidate absent from retain file as a new premise', () => {
    expect(classifyHkgovAlsBlockHouseTowerManualReview([candidate], [])).toMatchObject({
      newId: [candidate],
      retainId: [],
    })
  })
})
