import { describe, expect, test } from 'bun:test'

import {
  pairLandsdGovernmentNoticePdfEntries,
  pairLandsdStreetNoticePages,
  parseLandsdGovernmentNoticePdfText,
  parseLandsdStreetSourcePage,
} from './landsdStreet.ts'
import { resolveLandsdStreetDistricts } from './landsdStreetDistricts.ts'

const englishPage = `
  <li>Year 2026 (Last modified: 3.7.2026)</li>
  <table><tr data-year="2026">
    <td>3 July 2026</td><td>Central Wan Chai Bypass</td>
    <td>Central &amp; Western - Wan Chai - Eastern</td><td>Declaration of street name</td>
    <td><a href="/doc/en/street-name/egazette/2026/egn202630274034.pdf">G.N.4034</a></td>
    <td><a href="/doc/en/street-name/gnplan/2026/HKRM52.pdf">HKRM52</a></td>
  </tr></table>
`

const traditionalChinesePage = `
  <li>2026 年（最後修訂日期: 3.7.2026）<div class="hidden_revision_date">3.7.2026</div></li>
  <table><tr data-year="2026">
    <td>2026年7月3日</td><td>中環灣仔繞道</td>
    <td>中西區-灣仔-東區</td><td>宣布街道名稱</td>
    <td><a href="/doc/tc/street-name/egazette/2026/cgn202630274034.pdf">第4034號</a></td>
    <td><a href="/doc/en/street-name/gnplan/2026/HKRM52.pdf">HKRM52</a></td>
  </tr></table>
`

describe('LandsD bilingual street notices', () => {
  test('parses and pairs the official English and Traditional Chinese rows', () => {
    const en = parseLandsdStreetSourcePage(englishPage, 'en')
    const zhHant = parseLandsdStreetSourcePage(traditionalChinesePage, 'zh-Hant')
    const paired = pairLandsdStreetNoticePages({ en, zhHant })

    expect(en.lastModified).toBe('2026-07-03')
    expect(zhHant.lastModified).toBe('2026-07-03')
    expect(paired).toEqual([
      expect.objectContaining({
        district: {
          en: 'Central & Western - Wan Chai - Eastern',
          zhHant: '中西區-灣仔-東區',
        },
        governmentNoticeType: 'declaration',
        names: { en: 'Central Wan Chai Bypass', zhHant: '中環灣仔繞道' },
        planUrls: [
          {
            label: 'HKRM52',
            url: 'https://www.landsd.gov.hk/doc/en/street-name/gnplan/2026/HKRM52.pdf',
          },
        ],
        publicationDate: '2026-07-03',
      }),
    ])
    expect(paired[0]?.id).not.toContain('Central Wan Chai Bypass')
  })

  test('blocks publication when a bilingual notice has no counterpart', () => {
    const en = parseLandsdStreetSourcePage(englishPage, 'en')
    const zhHant = parseLandsdStreetSourcePage(
      traditionalChinesePage.replace('2026年7月3日', '2026年7月4日'),
      'zh-Hant',
    )

    expect(() => pairLandsdStreetNoticePages({ en, zhHant })).toThrow(
      'LandsD bilingual pairing failed',
    )
  })

  test('extracts bilingual descriptions and pairs structured Government Notice PDF rows', () => {
    const notices = pairLandsdStreetNoticePages({
      en: parseLandsdStreetSourcePage(englishPage, 'en'),
      zhHant: parseLandsdStreetSourcePage(traditionalChinesePage, 'zh-Hant'),
    })
    const notice = notices[0]
    if (!notice) throw new Error('Expected paired LandsD notice.')
    const english = parseLandsdGovernmentNoticePdfText(
      `${fixedWidthRow(
        'Description',
        'Name',
        'Previous G.N.',
        'Effective from 3 July 2026.',
        'Central Wan Chai Bypass',
        'G.N. 4000',
      )}\n3 July 2026`,
      'en',
    )
    const zhHant = parseLandsdGovernmentNoticePdfText(
      `${fixedWidthRow(
        '說明',
        '名稱',
        '前政府公告',
        '由銅鑼灣至北角，於2026年7月3日起生效。',
        '中環灣仔繞道',
        '第4000號',
      )}\n2026 年 7 月 3 日`,
      'zh-Hant',
    )

    expect(english).toMatchObject({
      diagnostics: { layout: 'description-name-previous-gn', status: 'success' },
      entries: [
        {
          effectiveDate: '2026-07-03',
          name: 'Central Wan Chai Bypass',
          previousNoticeRefs: ['gn4000'],
        },
      ],
    })
    const paired = pairLandsdGovernmentNoticePdfEntries({
      english: new Map([[notice.id, english]]),
      notices,
      zhHant: new Map([[notice.id, zhHant]]),
    })
    expect(paired.get(notice.id)).toMatchObject({
      descriptions: {
        en: 'Effective from 3 July 2026.',
        zhHant: '由銅鑼灣至北角，於2026年7月3日起生效。',
      },
      effectiveDate: '2026-07-03',
      previousNoticeRefs: ['gn4000'],
    })
  })

  test('parses historical two-column notices with predecessor candidates', () => {
    const english = parseLandsdGovernmentNoticePdfText(
      [
        'G.N. 1595',
        'The description will replace that set out in G.N. 6891 dated 19 October 2012.',
        'Description                                      Name',
        'A replacement description.                        YIU SING STREET',
      ].join('\n'),
      'en',
    )
    const zhHant = parseLandsdGovernmentNoticePdfText(
      [
        '第 1595 號公告',
        '2012 年 10 月 19 日第 6891 號政府公告載述的說明由以下說明取代。',
        `${'說明'.padEnd(48)}名稱`,
        `${'新的說明。'.padEnd(48)}耀星街`,
      ].join('\n'),
      'zh-Hant',
    )

    expect(english).toMatchObject({
      diagnostics: { layout: 'description-name', status: 'success' },
      entries: [
        {
          name: 'YIU SING STREET',
          previousNoticeRefs: ['gn6891'],
        },
      ],
    })
    expect(zhHant).toMatchObject({
      diagnostics: { layout: 'description-name', status: 'success' },
      entries: [
        {
          name: '耀星街',
          previousNoticeRefs: ['gn6891'],
        },
      ],
    })
  })

  test('does not treat statutory chapter and section numbers as previous notices', () => {
    const parsed = parseLandsdGovernmentNoticePdfText(
      [
        '第 1596 號公告',
        '現根據《公眾衞生及市政條例》( 第 132 章 ) 第 111C(1)(a) 條公布。',
        `${'說明'.padEnd(48)}名稱`,
        `${'新的道路。'.padEnd(48)}龍悅道`,
      ].join('\n'),
      'zh-Hant',
    )

    expect(parsed.entries[0]?.previousNoticeRefs).toEqual([])
  })

  test('keeps a wrapped English street name in its original table row', () => {
    const parsed = parseLandsdGovernmentNoticePdfText(
      [
        `${'Description'.padEnd(64)}Name`,
        `${'The street starts at the pier and'.padEnd(64)}PENG CHAU HO`,
        `${'continues to the village road.'.padEnd(64)}KING STREET`,
        'A copy of Plan No. ISRM95 and this notice may be inspected.',
      ].join('\n'),
      'en',
    )

    expect(parsed.entries).toMatchObject([{ name: 'PENG CHAU HO KING STREET' }])
  })

  test('retains unstructured corrigenda for review by source-page ordinal', () => {
    const notices = pairLandsdStreetNoticePages({
      en: parseLandsdStreetSourcePage(englishPage, 'en'),
      zhHant: parseLandsdStreetSourcePage(traditionalChinesePage, 'zh-Hant'),
    })
    const notice = notices[0]
    if (!notice) throw new Error('Expected paired LandsD notice.')
    const english = parseLandsdGovernmentNoticePdfText(
      'G.N. 3182\nCorrigendum\nWith reference to Government Notice No. 2725.\n3 July 2026',
      'en',
    )
    const zhHant = parseLandsdGovernmentNoticePdfText(
      '第 3182 號公告\n勘誤\n茲提述第 2725 號政府公告。\n2026 年 7 月 3 日',
      'zh-Hant',
    )

    expect(english.diagnostics).toMatchObject({
      layout: 'unstructured-notice',
      status: 'success',
    })
    expect(
      pairLandsdGovernmentNoticePdfEntries({
        english: new Map([[notice.id, english]]),
        notices,
        zhHant: new Map([[notice.id, zhHant]]),
      }).get(notice.id),
    ).toMatchObject({ previousNoticeRefs: ['gn2725'] })
  })

  test('resolves multi-district and island labels without storing stable IDs in code', () => {
    const districts = [
      { id: 'district-central-western', names: { en: 'Central and Western' } },
      { id: 'district-wan-chai', names: { en: 'Wan Chai' } },
      { id: 'district-eastern', names: { en: 'Eastern' } },
      { id: 'district-islands', names: { en: 'Islands', zhHant: '離島區' } },
    ]

    expect(
      resolveLandsdStreetDistricts(
        { en: 'Central & Western - Wan Chai - Eastern', zhHant: '中西區-灣仔-東區' },
        districts,
      ),
    ).toEqual({
      districtIds: [
        'district-central-western',
        'district-eastern',
        'district-wan-chai',
      ],
      unmatched: [],
    })
    expect(resolveLandsdStreetDistricts({ en: 'Islands (Lantau)' }, districts)).toEqual(
      { districtIds: ['district-islands'], unmatched: [] },
    )
  })
})

function fixedWidthRow(
  descriptionHeader: string,
  nameHeader: string,
  previousHeader: string,
  description: string,
  name: string,
  previous: string,
) {
  const descriptionWidth = 40
  const nameWidth = 34
  return [
    `${descriptionHeader.padEnd(descriptionWidth)}${nameHeader.padEnd(nameWidth)}${previousHeader}`,
    `${description.padEnd(descriptionWidth)}${name.padEnd(nameWidth)}${previous}`,
  ].join('\n')
}
