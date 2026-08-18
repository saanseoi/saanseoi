import { describe, expect, test } from 'bun:test'

import {
  suggestHkgroStreetClassification,
  type HkgroStreetDiscoveryRecord,
} from './hkgroStreetNamesDiscover.ts'
import { formatReviewContext, recordsForReview } from './hkgroStreetNamesReview.ts'

function record(input: Partial<HkgroStreetDiscoveryRecord> = {}) {
  return {
    candidateReasons: ['street-type'],
    decision: null,
    excerpt: 'The street shall be named Example Road.',
    hkgroPdfId: '460097',
    ocr: {
      outputPath: 'data/hku/hkgro/street-name/ocr/1901/460097.ocr.json',
      sourceSha256: 'ocr-source-hash',
    },
    source: {
      byteLength: 123,
      localPath: 'data/hku/hkgro/street-name/1901/460097.pdf',
      officialUrl: 'https://sunzi.lib.hku.hk/hkgro/view/g1901/460097.pdf',
      sha256: 'source-hash',
    },
    reviewPages: [
      {
        excerpt: 'The street shall be named Example Road.',
        pageNumber: 1,
      },
    ],
    suggested: {
      classification: 'manual-review' as const,
      kinds: ['name-change' as const],
      reasons: ['title: naming language'],
      score: 90,
    },
    tocEntries: [
      {
        notificationNumber: '123',
        publicationDate: '1901-01-01',
        subject: 'Naming of Example Road',
      },
    ],
    year: 1901,
    ...input,
  } satisfies HkgroStreetDiscoveryRecord
}

describe('HKGRO street-name review', () => {
  test('resumes undecided suggested records and revisits deferred records with --all', () => {
    const deferred = record({
      hkgroPdfId: '460098',
      decision: {
        classification: 'manual-review',
        kind: null,
        notes: null,
        reviewedAt: '2026-07-27T00:00:00.000Z',
      },
    })
    const accepted = record({
      hkgroPdfId: '460099',
      decision: {
        classification: 'street-name',
        kind: 'declaration',
        notes: null,
        reviewedAt: '2026-07-27T00:00:00.000Z',
      },
    })
    const unclassified = record({
      hkgroPdfId: '460100',
      suggested: {
        classification: 'unclassified',
        kinds: [],
        reasons: [],
        score: 0,
      },
    })
    const undecided = record({ hkgroPdfId: '460101' })

    expect(
      recordsForReview([deferred, accepted, unclassified, undecided], {
        includeAll: false,
      }),
    ).toEqual([undecided])
    expect(
      recordsForReview([deferred, accepted, unclassified, undecided], {
        includeAll: true,
      }),
    ).toEqual([deferred, unclassified, undecided])
  })

  test('includes source evidence and makes the OCR boundary clear', () => {
    const context = formatReviewContext(record())

    expect(context).toContain('\u001B[36mYear / HKGRO PDF\u001B[39m')
    expect(context).toContain('\u001B[33m1901\u001B[39m')
    expect(context).toContain('Naming of Example Road')
    expect(context).toContain('https://sunzi.lib.hku.hk/hkgro/view/g1901/460097.pdf')
    expect(context).toContain('Relevant OCR page(s)')
    expect(context).toContain('Page 1')
    expect(context).toContain('OCR excerpt (not source evidence)')
  })

  test('neutralises source-controlled terminal and bidi sequences', () => {
    const context = formatReviewContext(
      record({
        reviewPages: [
          {
            excerpt: 'forged\u001B]52;c;Y29weQ==\u0007\u202Etext',
            pageNumber: 1,
          },
        ],
        tocEntries: [
          {
            notificationNumber: '123',
            publicationDate: '1901-01-01',
            subject: 'Naming\rforged prompt',
          },
        ],
      }),
    )

    expect(context).not.toContain('\u001B]52')
    expect(context).not.toContain('\u0007')
    expect(context).not.toContain('\u202E')
    expect(context).not.toContain('\r')
  })

  test('distinguishes absorption into an existing street from a rename', () => {
    const suggestion = suggestHkgroStreetClassification(
      record(),
      'That part of the Street hitherto known as Albany Street shall from henceforth cease to form part of Albany Street, and shall be known as Albany Lane.',
    )

    expect(suggestion.kinds).toContain('absorption')
  })
})
