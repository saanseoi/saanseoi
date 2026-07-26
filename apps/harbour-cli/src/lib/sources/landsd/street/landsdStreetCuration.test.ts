import { expect, test } from 'bun:test'

import type {
  PairedLandsdGovernmentNoticePdfEntry,
  PairedLandsdStreetNotice,
} from './landsdStreet.ts'
import {
  emptyLandsdStreetCuration,
  formatLifecycleReviewContext,
  resolveLandsdStreetCuration,
} from './landsdStreetCuration.ts'

test('starts with a versioned application-fixture manifest', () => {
  expect(emptyLandsdStreetCuration()).toEqual({ schemaVersion: 2, decisions: [] })
})

test('includes Gazette descriptions and exact English baseline candidates in review', () => {
  const notice = {
    governmentNoticeType: 'change',
    governmentNotices: {
      en: { url: 'https://example.com/en.pdf' },
      zhHant: { url: 'https://example.com/zh.pdf' },
    },
    id: 'notice-1',
    names: { en: 'Yiu Sing Street', zhHant: '耀星街' },
    noticeIdentity: 'gn1595',
    publicationDate: '2026-07-03',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: 'A replacement description.', zhHant: '新的說明。' },
  } as PairedLandsdGovernmentNoticePdfEntry

  const result = resolveLandsdStreetCuration({
    baselineCandidates: [
      {
        districtCodes: ['kt'],
        names: { en: 'YIU SING STREET', zhHant: '耀星街' },
        recordKey: 'baseline-yiu-sing',
        streetId: '018f0b41-1a00-7000-8000-000000000001',
      },
    ],
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.review).toEqual([
    expect.objectContaining({
      baselineCandidates: [
        expect.objectContaining({
          districtCodes: ['kt'],
          streetId: '018f0b41-1a00-7000-8000-000000000001',
        }),
      ],
      descriptions: { en: 'A replacement description.', zhHant: '新的說明。' },
    }),
  ])
})

test('automatically applies a parseable Chinese-name-and-description corrigendum', () => {
  const notice = {
    governmentNoticeType: 'corrigendum',
    governmentNotices: {
      en: { url: 'https://example.com/en.pdf' },
      zhHant: { url: 'https://example.com/zh.pdf' },
    },
    id: 'notice-9290',
    names: { en: 'Lai Po Road', zhHant: '茘寶路' },
    noticeIdentity: 'gn9290',
    publicationDate: '2018-12-14',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: null, zhHant: null },
    rawExtractedText: {
      en: `With reference to the Chinese version of the Government Notice No. 8969, it is hereby notified that the character ‘茘’ in the Chinese name and description of ‘Lai Po Road 茘寶路’ should be amended to read ‘荔’.`,
      zhHant:
        '關於 2018 年第 8969 號政府公告中文版，現公布在名稱和說明欄內載列的「茘寶路」中的「茘」字，更正為「荔」。',
    },
  } as PairedLandsdGovernmentNoticePdfEntry

  const result = resolveLandsdStreetCuration({
    baselineCandidates: [
      {
        districtCodes: ['ssp'],
        names: { en: 'LAI PO ROAD', zhHant: '荔寶路' },
        recordKey: 'baseline-lai-po',
        streetId: '018f0b41-1a00-7000-8000-000000000002',
      },
    ],
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.unresolved).toEqual([])
  expect(result.review[0]).toMatchObject({
    correction: {
      fields: ['zh-Hant.name', 'zh-Hant.description'],
      from: '茘',
      to: '荔',
    },
    name: { en: 'Lai Po Road', zhHant: '荔寶路' },
  })
  expect(result.applied.get(notice.id)).toMatchObject({
    affectedStreetId: '018f0b41-1a00-7000-8000-000000000002',
    correction: {
      fields: ['zh-Hant.name', 'zh-Hant.description'],
      from: '茘',
      to: '荔',
    },
    method: 'automatic',
  })
  const context = formatLifecycleReviewContext(result.review[0]!)
  expect(context).toContain('Chinese name correction')
  expect(context).toContain('Chinese description correction')
  expect(context).toContain('茘寶路')
  expect(context).toContain('荔寶路')
  expect(context).not.toContain('Source record')
  expect(context).not.toContain('Notice type')
  expect(context).not.toContain('Traditional Chinese PDF')
})

test('recognises a corrigendum scoped to Previous G.N. provenance', () => {
  const notice = {
    governmentNoticeType: 'corrigendum',
    governmentNotices: { en: null, zhHant: null },
    id: 'notice-previous-gn',
    names: { en: 'Lai Po Road', zhHant: '荔寶路' },
    noticeIdentity: 'gn9300',
    publicationDate: '2018-12-21',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: null, zhHant: null },
    rawExtractedText: {
      en: 'The character ‘8’ in the Previous G.N. should be amended to read ‘9’.',
      zhHant: '',
    },
  } as PairedLandsdGovernmentNoticePdfEntry
  const result = resolveLandsdStreetCuration({
    baselineCandidates: [
      {
        districtCodes: ['ssp'],
        names: { en: 'LAI PO ROAD', zhHant: '荔寶路' },
        recordKey: 'baseline-lai-po',
        streetId: '018f0b41-1a00-7000-8000-000000000002',
      },
    ],
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.applied.get(notice.id)?.correction).toEqual({
    fields: ['previousNoticeRefs'],
    from: '8',
    to: '9',
  })
})

test('automatically applies an unambiguous description change', () => {
  const notice = {
    governmentNoticeType: 'change',
    governmentNotices: { en: null, zhHant: null },
    id: 'notice-description-change',
    names: { en: 'Yiu Sing Street', zhHant: '耀星街' },
    noticeIdentity: 'gn1595',
    publicationDate: '2016-03-18',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: 'A replacement description.', zhHant: '新的說明。' },
    rawExtractedText: {
      en: 'The description of YIU SING STREET will replace that set out in G.N. 6891.',
      zhHant: '耀星街的說明由以下說明取代。',
    },
  } as PairedLandsdGovernmentNoticePdfEntry

  const result = resolveLandsdStreetCuration({
    baselineCandidates: [
      {
        districtCodes: ['c&w'],
        names: { en: 'YIU SING STREET', zhHant: '耀星街' },
        recordKey: 'baseline-yiu-sing',
        streetId: '018f0b41-1a00-7000-8000-000000000001',
      },
    ],
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.unresolved).toEqual([])
  expect(result.review[0]).toMatchObject({
    automaticApplication: {
      affectedStreetId: '018f0b41-1a00-7000-8000-000000000001',
      method: 'automatic',
    },
    operation: 'description-change',
  })
  expect(result.applied.get(notice.id)).toMatchObject({
    affectedStreetId: '018f0b41-1a00-7000-8000-000000000001',
    disposition: 'apply',
    method: 'automatic',
  })
})

test('formats lifecycle review context with a notice type and distinct field values', () => {
  const context = formatLifecycleReviewContext({
    automaticApplication: null,
    baselineCandidates: [
      {
        districtCodes: ['c&w', 'wanchai'],
        names: { en: 'YIU SING STREET', zhHant: '耀星街' },
        recordKey: 'baseline-yiu-sing',
        streetId: '018f0b41-1a00-7000-8000-000000000001',
      },
    ],
    correction: null,
    curation: null,
    descriptions: { en: 'A replacement description.', zhHant: '新的說明。' },
    governmentNoticeType: 'change',
    governmentNoticeUrls: {
      en: 'https://example.com/en.pdf',
      zhHant: 'https://example.com/zh.pdf',
    },
    name: { en: 'Yiu Sing Street', zhHant: '耀星街' },
    sourceName: { en: 'Yiu Sing Street', zhHant: '耀星街' },
    noticeIdentity: 'gn1595',
    operation: 'name-change',
    parsedPreviousNoticeRefs: ['gn6891', 'gn7000'],
    publicationDate: '2016-03-18',
    sourceRecordId: 'notice-1',
  })

  expect(context).toContain(
    '\u001B[36mNotice type\u001B[39m: \u001B[33mchange\u001B[39m',
  )
  expect(context).toContain(
    '\u001B[33mYiu Sing Street\u001B[39m \u001B[90m/\u001B[39m \u001B[32m耀星街\u001B[39m',
  )
  expect(context).toContain(
    '\u001B[33mgn6891\u001B[39m \u001B[90m/\u001B[39m \u001B[32mgn7000\u001B[39m',
  )
})
