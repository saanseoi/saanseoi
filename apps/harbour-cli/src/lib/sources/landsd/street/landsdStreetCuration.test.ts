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

test('automatically applies a complete English street-name correction', () => {
  const notice = {
    governmentNoticeType: 'corrigendum',
    governmentNotices: { en: null, zhHant: null },
    id: 'notice-6118',
    names: { en: 'Gascoigne Road Fylover', zhHant: '加士居道天橋' },
    noticeIdentity: 'gn6118',
    publicationDate: '2020-10-23',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: null, zhHant: null },
    rawExtractedText: {
      en: `With reference to the English version of the Government Notice No. 5983, it is hereby notified that the street name ‘GASCOIGNE ROAD FYLOVER’ in the notice should be amended to read ‘GASCOIGNE ROAD FLYOVER’.`,
      zhHant: '',
    },
  } as PairedLandsdGovernmentNoticePdfEntry
  const result = resolveLandsdStreetCuration({
    baselineCandidates: [
      {
        districtCodes: ['ytm'],
        names: { en: 'GASCOIGNE ROAD FLYOVER', zhHant: '加士居道天橋' },
        recordKey: 'baseline-gascoigne-road-flyover',
        streetId: '018f0b41-1a00-7000-8000-000000000003',
      },
    ],
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.unresolved).toEqual([])
  expect(result.review[0]).toMatchObject({
    correction: {
      fields: ['en.name'],
      from: 'GASCOIGNE ROAD FYLOVER',
      to: 'GASCOIGNE ROAD FLYOVER',
    },
    name: { en: 'GASCOIGNE ROAD FLYOVER', zhHant: '加士居道天橋' },
  })
  expect(result.applied.get(notice.id)).toMatchObject({
    affectedStreetId: '018f0b41-1a00-7000-8000-000000000003',
    correction: {
      fields: ['en.name'],
      from: 'GASCOIGNE ROAD FYLOVER',
      to: 'GASCOIGNE ROAD FLYOVER',
    },
    method: 'automatic',
  })
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

test('automatically records a Chinese-notice date corrigendum as metadata only', () => {
  const notice = {
    governmentNoticeType: 'corrigendum',
    governmentNotices: { en: null, zhHant: null },
    id: 'notice-2321',
    names: { en: 'Fleming Road', zhHant: '菲林明道' },
    noticeIdentity: 'gn2321',
    publicationDate: '2019-03-29',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: null, zhHant: null },
    rawExtractedText: {
      en: `With reference to the Chinese version of the Government Notice No. 1971 in Gazette No. 11/2019 published on 15 March 2019, it is hereby notified that the date ‘2018 年 3 月 15 日’ in the Chinese notice should be amended to read ‘2019 年 3 月 15 日’.`,
      zhHant: '',
    },
  } as PairedLandsdGovernmentNoticePdfEntry
  const result = resolveLandsdStreetCuration({
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.unresolved).toEqual([])
  expect(result.review[0]?.chineseNoticeDateCorrigendum).toEqual({
    correctedDate: '2019-03-15',
    erroneousDate: '2018-03-15',
    targetNoticeRef: 'gn1971',
  })
  expect(result.applied.get(notice.id)).toMatchObject({
    affectedStreetId: null,
    disposition: 'noOp',
    method: 'automatic',
  })
})

test('automatically logs an unambiguous intention to rename the Chinese name', () => {
  const notice = {
    governmentNoticeType: 'intention',
    governmentNotices: { en: null, zhHant: null },
    id: 'notice-3020',
    names: { en: 'U Lam Terrace', zhHant: '儒林臺' },
    noticeIdentity: 'gn3020',
    publicationDate: '2016-05-27',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: 'Replacement description.', zhHant: '新的說明。' },
    rawExtractedText: {
      en: `Notice is hereby given that the Director of Lands intends to make a declaration to rename the Chinese street name of U LAM TERRACE from 裕林臺 to 儒林臺 in Central and Western District, Hong Kong Island as described hereunder:—`,
      zhHant: '',
    },
  } as PairedLandsdGovernmentNoticePdfEntry
  const result = resolveLandsdStreetCuration({
    baselineCandidates: [
      {
        districtCodes: ['c&w'],
        names: { en: 'U LAM TERRACE', zhHant: '儒林臺' },
        recordKey: 'baseline-u-lam-terrace',
        streetId: '018f0b41-1a00-7000-8000-000000000004',
      },
    ],
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.unresolved).toEqual([])
  expect(result.review[0]).toMatchObject({
    intentionRename: { from: '裕林臺', locale: 'zh-Hant', to: '儒林臺' },
  })
  expect(result.applied.get(notice.id)).toMatchObject({
    affectedStreetId: '018f0b41-1a00-7000-8000-000000000004',
    disposition: 'apply',
    method: 'automatic',
  })
})

test('describes a multi-street partial-renaming intention without applying it', () => {
  const notice = {
    governmentNoticeType: 'intention',
    governmentNotices: { en: null, zhHant: null },
    id: 'notice-875-lung-cheung',
    names: { en: 'Lung Cheung Road', zhHant: '龍翔道' },
    noticeIdentity: 'gn875',
    publicationDate: '2017-02-17',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: 'Replacement description.', zhHant: '新的說明。' },
    rawExtractedText: {
      en: `The Director of Lands intends to make a declaration to rename a section of HAMMER HILL ROAD as set out in G.N. 1872 dated 28 July 1972 in the district of Wong Tai Sin, Kowloon as a section of LUNG CHEUNG ROAD and to cease a section of HAMMER HILL ROAD inside the Diamond Hill Urn Cemetery as set out in G.N. 1468 dated 16 November 1956 to be known by that name as described hereunder:—`,
      zhHant: '',
    },
  } as PairedLandsdGovernmentNoticePdfEntry
  const result = resolveLandsdStreetCuration({
    baselineCandidates: [
      {
        districtCodes: ['wts'],
        names: { en: 'HAMMER HILL ROAD', zhHant: '斧山道' },
        recordKey: 'baseline-hammer-hill-road',
        streetId: '018f0b41-1a00-7000-8000-000000000005',
      },
    ],
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.unresolved).toHaveLength(1)
  expect(result.review[0]?.intentionSummary).toBe(
    'Rename part of HAMMER HILL ROAD as LUNG CHEUNG ROAD; Cease part of HAMMER HILL ROAD',
  )
  expect(
    result.review[0]?.baselineCandidates.map(candidate => candidate.names.en),
  ).toEqual(['HAMMER HILL ROAD'])
  expect(formatLifecycleReviewContext(result.review[0]!)).toContain('Proposed action')
})

test('recognises a partial-renaming intention that identifies its source in an earlier notice', () => {
  const notice = {
    governmentNoticeType: 'intention',
    governmentNotices: { en: null, zhHant: null },
    id: 'notice-6649-on-pik',
    names: { en: 'On Pik Road', zhHant: '安碧道' },
    noticeIdentity: 'gn6649',
    publicationDate: '2021-10-22',
  } as PairedLandsdStreetNotice
  const parsed = {
    descriptions: { en: 'Replacement description.', zhHant: '新的說明。' },
    rawExtractedText: {
      en: `The Director of Lands intends to make a declaration to rename a section of ANDERSON ROAD in the Sai Kung District, New Territories and the Kwun Tong District, Kowloon as set out in G.N. 2757 dated 10 December 1976 to ON PIK ROAD as described hereunder:—`,
      zhHant: '',
    },
  } as PairedLandsdGovernmentNoticePdfEntry
  const result = resolveLandsdStreetCuration({
    baselineCandidates: [
      {
        districtCodes: ['sk', 'kt'],
        names: { en: 'ANDERSON ROAD', zhHant: '安達臣道' },
        recordKey: 'baseline-anderson-road',
        streetId: '018f0b41-1a00-7000-8000-000000000006',
      },
    ],
    manifest: emptyLandsdStreetCuration(),
    notices: [notice],
    parsedEntries: new Map([[notice.id, parsed]]),
  })

  expect(result.unresolved).toHaveLength(1)
  expect(result.review[0]?.partialRenameIntention).toEqual({
    resultName: 'ON PIK ROAD',
    sourceName: 'ANDERSON ROAD',
  })
  expect(result.review[0]?.intentionSummary).toBe(
    'Rename part of ANDERSON ROAD as ON PIK ROAD',
  )
  expect(
    result.review[0]?.baselineCandidates.map(candidate => candidate.names.en),
  ).toEqual(['ANDERSON ROAD'])
  expect(formatLifecycleReviewContext(result.review[0]!)).toContain(
    'Rename part of ANDERSON ROAD as ON PIK ROAD',
  )
  expect(formatLifecycleReviewContext(result.review[0]!)).toContain(
    'Affected baseline streets',
  )
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

test('formats compact lifecycle review context with only decision-relevant fields', () => {
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
    partialRenameIntention: null,
    chineseNoticeDateCorrigendum: null,
    intentionSummary: null,
    intentionRename: null,
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

  expect(context).not.toContain('Source record')
  expect(context).not.toContain('Notice type')
  expect(context).not.toContain('Operation')
  expect(context).not.toContain('Notice reference')
  expect(context).not.toContain('Traditional Chinese PDF')
  expect(context).toContain(
    '\u001B[33mYiu Sing Street\u001B[39m \u001B[90m/\u001B[39m \u001B[32m耀星街\u001B[39m',
  )
  expect(context).toContain(
    '\u001B[33mgn6891\u001B[39m \u001B[90m/\u001B[39m \u001B[32mgn7000\u001B[39m',
  )
})
