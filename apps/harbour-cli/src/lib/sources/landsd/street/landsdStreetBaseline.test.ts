import { expect, test } from 'bun:test'

import type { LandsdStreetRecord } from './landsdStreetIngest.ts'
import {
  assignLandsdStreetBaselineIds,
  landsdStreetBaselineCandidatesFromRecords,
} from './landsdStreetIngest.ts'

test('mints missing baseline IDs once and exposes them as review candidates', () => {
  const records = [
    {
      application: null,
      deferToNotices: false,
      districtCodes: ['kt'],
      effectiveDate: null,
      evidenceAssets: [],
      gazetteDate: null,
      i18n: [
        { description: null, locale: 'en', name: 'YIU SING STREET' },
        { description: null, locale: 'zh-Hant', name: '耀星街' },
      ],
      noticeRef: null,
      noticeType: null,
      parserDiagnostics: null,
      previousNoticeRefs: [],
      rawExtractedText: null,
      recordKey: 'landsd-street:baseline:yiu-sing',
      sourceKind: 'baseline',
      streetId: null,
    },
  ] satisfies LandsdStreetRecord[]

  const assigned = assignLandsdStreetBaselineIds(records)
  const [candidate] = landsdStreetBaselineCandidatesFromRecords(assigned)

  expect(assigned[0]?.streetId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(candidate).toMatchObject({
    districtCodes: ['kt'],
    names: { en: 'YIU SING STREET', zhHant: '耀星街' },
    streetId: assigned[0]?.streetId,
  })
  expect(assignLandsdStreetBaselineIds(assigned)).toEqual(assigned)
})
