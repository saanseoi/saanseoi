import { requireDefined } from '../../../requireDefined'
import { describe, expect, test } from 'bun:test'

import { createHash } from '../../utils'
import {
  buildCanonicalDivisionApiI18n,
  buildOvertureHongKongDivisionClassificationProcessingActions,
  buildOvertureHongKongAreaHierarchyProcessingActions,
  buildOvertureDivisionLocaleProcessingActions,
  collectOvertureHongKongDivisionSourceAssumptionViolations,
  type DivisionHierarchyLookup,
  normaliseDivisionI18nForStorage,
  prepareCuratedDivisionRow as normaliseDivisionRow,
} from './division'
import { getSupplementalDivisionFixtureRows } from './divisionFixtures'
import {
  missingOvertureHongKongAreaRows,
  overtureHongKongAreaForDistrictName,
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
  hasAllOvertureHongKongAreaDivisions,
} from './overtureHongKongAreas'

const hierarchyLookup: DivisionHierarchyLookup = new Map([
  [
    'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d',
    {
      i18n: {
        en: {
          name: 'Hong Kong SAR',
        },
        'zh-hant': {
          name: '香港特別行政區',
        },
      },
      level: 0,
      class: 'sar',
    },
  ],
  [
    '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
    {
      i18n: {
        en: {
          name: 'Central and Western District',
        },
        'zh-hant': {
          name: '中西區',
        },
      },
      level: 2,
      class: 'district',
    },
  ],
])

describe('collectOvertureHongKongDivisionSourceAssumptionViolations', () => {
  test('accepts only the pinned PRC publisher ancestor alongside the Hong Kong extract', () => {
    const rows = [
      {
        id: 'hk',
        theme: 'divisions',
        type: 'division',
        country: 'HK',
        norms: { driving_side: 'left' },
      },
      {
        id: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
        theme: 'divisions',
        type: 'division',
        subtype: 'country',
        country: 'CN',
        norms: { driving_side: 'right' },
      },
    ]
    expect(collectOvertureHongKongDivisionSourceAssumptionViolations(rows)).toEqual([])
    expect(
      collectOvertureHongKongDivisionSourceAssumptionViolations([
        rows[0]!,
        { ...rows[1]!, id: 'another-country' },
      ]),
    ).not.toEqual([])
  })

  test('accepts current dropped-field assumptions', () => {
    expect(
      collectOvertureHongKongDivisionSourceAssumptionViolations([
        {
          id: 'hk-sar',
          theme: 'divisions',
          type: 'division',
          country: 'HK',
          region: null,
          perspectives: null,
          norms: {
            driving_side: 'left',
          },
          names: {
            rules: [
              {
                value: 'Hong Kong SAR',
                perspectives: null,
                between: null,
                side: null,
              },
            ],
          },
          hierarchies: [[{ division_id: 'china' }, { division_id: 'hk-sar' }]],
        },
        {
          id: 'central-and-western',
          theme: 'divisions',
          type: 'division',
          country: 'HK',
          region: null,
          perspectives: null,
          norms: null,
          names: {
            rules: [],
          },
          hierarchies: [
            [
              { division_id: 'china' },
              { division_id: 'hk-sar' },
              { division_id: 'central-and-western' },
            ],
          ],
        },
      ]),
    ).toEqual([])
  })

  test('reports changed top-level dropped fields', () => {
    expect(
      collectOvertureHongKongDivisionSourceAssumptionViolations([
        {
          id: 'unexpected',
          theme: 'places',
          type: 'place',
          country: 'CN',
          region: 'HK',
          perspectives: {
            mode: 'union',
            countries: ['HK'],
          },
          norms: {
            driving_side: 'right',
          },
          names: {
            rules: [],
          },
        },
      ]),
    ).toEqual([
      'row 1 (unexpected): expected theme=divisions, got "places"',
      'row 1 (unexpected): expected type=division, got "place"',
      'row 1 (unexpected): expected country=HK, got "CN"',
      'row 1 (unexpected): expected empty region, got "HK"',
      'row 1 (unexpected): expected empty perspectives, got {"countries":["HK"],"mode":"union"}',
      'row 1 (unexpected): expected norms={driving_side:left}, got {"driving_side":"right"}',
    ])
  })

  test('reports populated name rule fields and repeated norms', () => {
    expect(
      collectOvertureHongKongDivisionSourceAssumptionViolations([
        {
          id: 'hk-sar',
          theme: 'divisions',
          type: 'division',
          country: 'HK',
          norms: {
            driving_side: 'left',
          },
          names: {
            rules: [
              {
                perspectives: {
                  mode: 'union',
                  countries: ['CN'],
                },
                between: [1, 2],
                side: 'left',
              },
            ],
          },
        },
        {
          id: 'district',
          theme: 'divisions',
          type: 'division',
          country: 'HK',
          norms: {
            driving_side: 'left',
          },
        },
      ]),
    ).toEqual([
      'row 1 (hk-sar): expected empty names.rules[].perspectives, got {"countries":["CN"],"mode":"union"}',
      'row 1 (hk-sar): expected empty names.rules[].between, got [1,2]',
      'row 1 (hk-sar): expected empty names.rules[].side, got "left"',
      'expected exactly one non-empty norms row with {driving_side:left}, found 2',
    ])
  })

  test('accepts multiple evidenced hierarchy alternatives', () => {
    expect(
      collectOvertureHongKongDivisionSourceAssumptionViolations([
        {
          id: 'district',
          theme: 'divisions',
          type: 'division',
          country: 'HK',
          norms: {
            driving_side: 'left',
          },
          hierarchies: [
            [{ division_id: 'china' }, { division_id: 'hk-sar' }],
            [{ division_id: 'china' }, { division_id: 'alt-hk-sar' }],
          ],
        },
      ]),
    ).toEqual([])
  })
})

describe('getSupplementalDivisionFixtureRows', () => {
  test('adds the missing Kai Tak level-6 precinct markers', () => {
    const rows = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    })
    for (const [id, name, zhHant, coordinates] of [
      [
        'ss-17f64895-23b4-5b58-87e1-085b6991efd0',
        'Kai Tak Sports Park',
        '啟德體育園',
        [114.1978125, 22.3236344],
      ],
      [
        'ss-4b0d5eea-5f94-59d1-8066-269e75c2c343',
        'Kai Tak Metro Park',
        '啟德都會公園',
        [114.1996688, 22.318758],
      ],
      [
        'ss-a8d56eb6-21ae-5745-b03a-3750530c1c71',
        'Kai Tak Cruise Terminal',
        '啟德郵輪碼頭',
        [114.2120721, 22.3070126],
      ],
    ] as const) {
      const row = rows.find(row => row.id === id)!
      expect(row.hierarchies).toEqual([])
      expect(normaliseDivisionRow(row)).toMatchObject({
        base: {
          class: 'microhood',
          geometry: { type: 'Point', coordinates },
          level: 6,
        },
        i18n: expect.arrayContaining([
          expect.objectContaining({ locale: 'en', name }),
          expect.objectContaining({ locale: 'zh-hant', name: zhHant }),
        ]),
      })
    }
  })

  test('adds Lan Kwai Fong as a curated microhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-d574ef9f-1f94-5f55-b13f-0f287ec06440')!
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'microhood',
        geometry: { type: 'Point', coordinates: [114.1556, 22.2808] },
        level: 6,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Lan Kwai Fong' }),
        expect.objectContaining({ locale: 'zh-hant', name: '蘭桂坊' }),
      ]),
    })
  })

  test('adds Thirty Houses as a curated Sheung Wan microhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-dbc94110-6e0d-584b-ae9d-fe87eb7857a2')!
    expect(row.hierarchies).toEqual([])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'microhood',
        geometry: { type: 'Point', coordinates: [114.1511702, 22.2833691] },
        level: 6,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({
          locale: 'en',
          name: 'Thirty Houses',
        }),
        expect.objectContaining({
          locale: 'zh-hant',
          name: '卅間',
        }),
      ]),
    })
  })

  test('adds Tai Tam Gap as a curated Eastern District neighbourhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-e0b47921-ffd5-5ee6-9d70-c29d74b7092e')!
    expect(row.hierarchies).toEqual([])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'neighbourhood',
        geometry: { type: 'Point', coordinates: [114.2281758, 22.2574719] },
        level: 5,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Tai Tam Gap' }),
        expect.objectContaining({ locale: 'zh-hant', name: '大潭峽' }),
      ]),
    })
  })

  test('adds Tai Tam Tau as a curated Southern District microhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-da8b4297-eee1-5acc-a731-743d590d4ebc')!
    expect(row.hierarchies).toEqual([])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'microhood',
        geometry: { type: 'Point', coordinates: [114.2187883, 22.1951389] },
        level: 6,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Tai Tam Tau' }),
        expect.objectContaining({ locale: 'zh-hant', name: '大潭頭' }),
      ]),
    })
  })

  test('adds Cape Collinson as a curated Eastern District neighbourhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-d8e22301-6c35-509e-aa53-9c437457891d')!
    expect(row.hierarchies).toEqual([])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'neighbourhood',
        geometry: { type: 'Point', coordinates: [114.2453662, 22.2582498] },
        level: 5,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Cape Collinson' }),
        expect.objectContaining({ locale: 'zh-hant', name: '歌連臣角' }),
      ]),
    })
  })

  test('adds Hok Tsui Lower Village as a curated Southern District hamlet', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-59b37ac9-f5f5-5eef-937f-b99539820ac1')!
    expect(row.hierarchies).toEqual([])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'hamlet',
        geometry: { type: 'Point', coordinates: [114.2420554, 22.2101577] },
        level: 6,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Hok Tsui Lower Village' }),
        expect.objectContaining({
          locale: 'zh-hant',
          name: '鶴咀下村',
          nameAlts: null,
        }),
      ]),
    })
  })

  test('adds Sandy Bay Gap as a curated Central and Western District microhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-724d3274-b81e-5b55-8d8a-c11109d5ca40')!
    expect(row.hierarchies).toEqual([])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'microhood',
        geometry: { type: 'Point', coordinates: [114.1293839, 22.2758724] },
        level: 6,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Sandy Bay Gap' }),
        expect.objectContaining({ locale: 'zh-hant', name: '沙灣坳' }),
      ]),
    })
  })

  test('retains the Lei Cheng Uk GERS identity with Li Cheng Uk as an alias', () => {
    const row = {
      id: '56dad78a-02e0-4a7d-8f3c-1f264766023b',
      subtype: 'neighborhood',
      names: {
        primary: '李鄭屋 Li Cheng Uk',
        common: { en: 'Li Cheng Uk', 'zh-Hant': '李鄭屋' },
      },
    }
    expect(
      getSupplementalDivisionFixtureRows({
        source: 'saanseoi',
        resourceType: 'division',
        regionCode: 'hk',
      }).some(entry => entry.id === row.id),
    ).toBe(false)
    expect(normaliseDivisionRow({ ...row, class: 'neighbourhood' })).toMatchObject({
      base: { id: row.id, class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({
          locale: 'en',
          name: 'Lei Cheng Uk',
          nameAlts: 'Li Cheng Uk',
        }),
      ]),
    })
  })
  test('adds Austin as a curated neighbourhood under Yau Tsim Mong', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-04e117cb-f696-51f4-abe2-709a52100253')!
    expect(row.hierarchies).toEqual([])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Austin' }),
        expect.objectContaining({ locale: 'zh-hant', name: '柯士甸' }),
      ]),
    })
    expect(row.sources).toEqual([
      { dataset: 'SaanSeoi curated additions', record_id: 'saanseoi-hk-austin' },
    ])
  })
  test('adds Jordan as a curated neighbourhood under Yau Tsim Mong', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-fbd43b34-3972-58cd-82ce-d431f834af2e')!
    expect(row.hierarchies).toEqual([])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Jordan' }),
        expect.objectContaining({ locale: 'zh-hant', name: '佐敦' }),
      ]),
    })
    expect(row.sources).toEqual([
      { dataset: 'SaanSeoi curated additions', record_id: 'saanseoi-hk-jordan' },
    ])
  })
  test('adds Prince Edward as a curated neighbourhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-28506769-02c3-5edf-9e23-99999e25bfe8')!
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Prince Edward' }),
        expect.objectContaining({ locale: 'zh-hant', name: '太子' }),
      ]),
    })
    expect(row.sources).toEqual([
      {
        dataset: 'SaanSeoi curated additions',
        record_id: 'saanseoi-hk-prince-edward',
      },
    ])
  })
  test('adds curated Waterfall Bay as a neighbourhood with SaanSeoi provenance', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-03386e65-c456-5b59-a1e7-3eac52cd3a97')!
    expect(row.sources).toEqual([
      {
        dataset: 'SaanSeoi curated additions',
        record_id: 'saanseoi-hk-waterfall-bay',
      },
    ])
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Waterfall Bay' }),
        expect.objectContaining({ locale: 'zh-hant', name: '瀑布灣' }),
      ]),
    })
  })

  test('adds curated Sheung and Ha Yuen Leng divisions under Wong Tai Sin', () => {
    const rows = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    })
    for (const [id, name, zhHant, classification, level, coordinates] of [
      [
        'ss-f39f079d-ee2d-56c5-9071-3ec16421401a',
        'Sheung Yuen Leng',
        '上元嶺',
        'neighbourhood',
        5,
        [114.2059129, 22.3415699],
      ],
      [
        'ss-d988dc78-d63d-5deb-a4b9-7b596a748e39',
        'Ha Yuen Leng',
        '下元嶺',
        'microhood',
        6,
        [114.204061, 22.338932],
      ],
    ] as const) {
      const row = rows.find(row => row.id === id)!
      expect(row).toMatchObject({
        hierarchies: [],
        geometry: { type: 'Point', coordinates },
        fixture: {
          code: expect.stringMatching(/^saanseoi-hk-/),
          reviewStatus: 'reviewed',
        },
      })
      expect(normaliseDivisionRow(row)).toMatchObject({
        base: { id, class: classification, level },
        i18n: expect.arrayContaining([
          expect.objectContaining({ locale: 'en', name }),
          expect.objectContaining({ locale: 'zh-hant', name: zhHant }),
        ]),
      })
    }
  })

  test('adds Cha Liu Au as a curated Kwun Tong level-4 macrohood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-cf671d96-6ff6-5e99-b5f4-d6ffc3133f2a')!
    expect(row).toMatchObject({
      hierarchies: [],
      geometry: { type: 'Point', coordinates: [114.2250772, 22.3341772] },
      fixture: { code: 'saanseoi-hk-cha-liu-au', reviewStatus: 'reviewed' },
    })
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'macrohood', level: 4 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Cha Liu Au' }),
        expect.objectContaining({ locale: 'zh-hant', name: '茶寮坳' }),
      ]),
    })
  })

  test('adds Ping Shan as a curated Kwun Tong level-5 neighbourhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'saanseoi',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'ss-8b1c69bf-eff8-5bcd-acd7-3e5071bee1d6')!
    expect(row).toMatchObject({
      hierarchies: [],
      geometry: { type: 'Point', coordinates: [114.2188153, 22.3307477] },
      fixture: { code: 'saanseoi-hk-ping-shan', reviewStatus: 'reviewed' },
    })
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Ping Shan' }),
        expect.objectContaining({ locale: 'zh-hant', name: '平山' }),
      ]),
    })
  })

  test('does not add the anchor to unrelated snapshots', () => {
    expect(
      getSupplementalDivisionFixtureRows({
        source: 'saanseoi',
        resourceType: 'divisionBoundary',
        regionCode: 'hk',
      }),
    ).toEqual([])
  })
})

describe('missingOvertureHongKongAreaRows', () => {
  const sourceRows = overtureHongKongAreas.flatMap(area =>
    area.districtNames.map((name, index) => ({
      id: `${area.code}-district-${index}`,
      names: { common: { en: name }, primary: name },
      subtype: 'region',
    })),
  )

  test('keeps the administrative Kowloon area distinct from the source city', () => {
    expect(overtureHongKongAreaDivisionId('kowloon')).not.toBe(
      '17009785-57fd-4e5b-af86-2d27352e4718',
    )
  })

  test('synthesises each missing Hong Kong level-1 area from its district members', () => {
    const rows = missingOvertureHongKongAreaRows(
      { regionCode: 'hk', source: 'overture', resourceType: 'division' },
      sourceRows,
    )

    expect(rows).toHaveLength(3)
    for (const area of overtureHongKongAreas) {
      const row = rows.find(row => row.id === overtureHongKongAreaDivisionId(area.code))
      expect(row?.names.primary).toBe(area.names.en)
      expect(row?.wikidata).toBe(area.wikidata)
      expect(row?.identifiers.saanseoiCorrection.districtDivisionIds).toHaveLength(
        area.districtNames.length,
      )
    }
  })

  test('adds the administrative area alongside the source city polygon', () => {
    const rows = missingOvertureHongKongAreaRows(
      { regionCode: 'hk', source: 'overture', resourceType: 'division' },
      [
        ...sourceRows,
        {
          geometry: { coordinates: [], type: 'Polygon' },
          id: '17009785-57fd-4e5b-af86-2d27352e4718',
          names: { primary: 'Kowloon' },
          subtype: 'locality',
        },
      ],
    )

    expect(rows.map(row => row.names.primary)).toContain('Kowloon')
  })

  test('preserves Kowloon when Overture supplies its area identity as a point', () => {
    const rows = missingOvertureHongKongAreaRows(
      { regionCode: 'hk', source: 'overture', resourceType: 'division' },
      [
        ...sourceRows,
        {
          geometry: { coordinates: [114.1768, 22.3116], type: 'Point' },
          id: '17009785-57fd-4e5b-af86-2d27352e4718',
          names: { primary: 'Kowloon' },
          subtype: 'locality',
        },
      ],
    )

    expect(rows).not.toContainEqual(
      expect.objectContaining({ id: '17009785-57fd-4e5b-af86-2d27352e4718' }),
    )
  })

  test('preserves an existing canonical administrative area identity', () => {
    const hongKongIsland = overtureHongKongAreas.find(
      area => area.code === 'hong-kong-island',
    )
    if (!hongKongIsland) throw new Error('Hong Kong Island fixture is missing.')
    const divisionId = overtureHongKongAreaDivisionId(hongKongIsland.code)
    const rows = missingOvertureHongKongAreaRows(
      { regionCode: 'hk', source: 'overture', resourceType: 'division' },
      [
        ...sourceRows,
        {
          geometry: { coordinates: [114.1768, 22.3116], type: 'Point' },
          id: divisionId,
          names: { primary: hongKongIsland.names.en },
          subtype: 'locality',
        },
      ],
    )

    expect(rows.find(row => row.id === divisionId)).toBeUndefined()
  })
})

describe('complete Overture Hong Kong Area identities', () => {
  test('requires all canonical area identities in a complete snapshot', () => {
    const areaIds = overtureHongKongAreas.map(area =>
      overtureHongKongAreaDivisionId(area.code),
    )
    const presentAreaIds = areaIds.filter((id): id is string => id !== null)

    expect(hasAllOvertureHongKongAreaDivisions(presentAreaIds)).toBe(true)
    expect(hasAllOvertureHongKongAreaDivisions(presentAreaIds.slice(1))).toBe(false)
  })
})

describe('overtureHongKongAreaForDistrictName', () => {
  test('assigns Overture’s extra Lok Ma Chau Loop level-2 division to the New Territories', () => {
    expect(overtureHongKongAreaForDistrictName('Lok Ma Chau Loop')).toMatchObject({
      code: 'new-territories',
    })
  })
})

describe('normaliseDivisionRow i18n', () => {
  test('keeps C&SD Housing Market Areas outside the Division hierarchy', () => {
    const normalised = normaliseDivisionRow({
      canonical_type: 'housing-market-area',
      geometry: {
        coordinates: [
          [
            [114.15, 22.28],
            [114.16, 22.28],
            [114.16, 22.29],
            [114.15, 22.28],
          ],
        ],
        type: 'Polygon',
      },
      id: 'CENSTATD:HMA:HMA001',
      identifiers: { hkgovCenstatd: { code: 'HMA001' } },
      names: { common: { en: ['Example HMA'], 'zh-hant': ['示例樓市片區'] } },
      source: 'hkgov-censtatd',
      source_properties: { hma: 'HMA001' },
      sources: [],
    })

    expect(normalised.base.geometry).toMatchObject({ type: 'Point' })
    expect(normalised).toMatchObject({
      base: {
        hierarchies: { full: [] },
        level: null,
        class: 'housing-market-area',
      },
    })
  })

  test('retains LandsD settlement classification and full source provenance', () => {
    const normalised = normaliseDivisionRow({
      class: 'Town',
      district: 'CW',
      geo_name_id: '101',
      geometry: { coordinates: [114.1577, 22.2855], type: 'Point' },
      id: 'LANDSD:101',
      names: { common: { en: 'Central', 'zh-hant': '中環' } },
      place_class: 'Settlement',
      place_type: 'Town',
      source: 'hkgov-landsd',
      source_feature: {
        geometry: { coordinates: [114.1577, 22.2855], type: 'Point' },
        properties: { GEO_NAME_ID: '101', PLACE_CLASS: 'Settlement' },
        type: 'Feature',
      },
      source_properties: { GEO_NAME_ID: '101', PLACE_CLASS: 'Settlement' },
      subtype: 'locality',
    })

    expect(normalised).toMatchObject({
      base: {
        geometry: { coordinates: [114.1577, 22.2855], type: 'Point' },
        level: 5,
        sources: {
          sourceResolutions: { entityId: 'LANDSD:101' },
        },
        class: 'settlement',
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Central' }),
        expect.objectContaining({ locale: 'zh-hant', name: '中環' }),
      ]),
    })
  })

  test('defaults unlabeled Chinese names and alternate rules to zh-hant for Hong Kong', () => {
    const normalised = normaliseDivisionRow({
      id: 'division-traditional-chinese',
      subtype: 'macrohood',
      names: {
        primary: '石崗 Shek Kong',
        common: {
          en: 'Shek Kong',
          zh: '石崗',
        },
        rules: [
          {
            language: null,
            side: null,
            value: '西人村',
            variant: 'alternate',
          },
        ],
      },
    })

    expect(normalised.i18n).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isLocaleInferred: false,
          locale: 'zh-hant',
          name: '石崗',
          nameAlts: '西人村',
          nameRules: [{ value: '西人村', variant: 'alternate' }],
        }),
      ]),
    )
    expect(normalised.i18n.some(row => row.locale === 'zh-hans')).toBe(false)
  })

  test('marks a locale-less Chinese alternate rule as inferred zh-hant', () => {
    const normalised = normaliseDivisionRow({
      id: 'division-alternate-traditional-chinese',
      subtype: 'macrohood',
      names: {
        rules: [
          {
            language: null,
            side: null,
            value: '上灣村',
            variant: 'alternate',
          },
        ],
      },
    })

    expect(normalised.i18n).toEqual([
      expect.objectContaining({
        isLocaleInferred: true,
        locale: 'zh-hant',
        name: '上灣村',
        nameRules: [{ value: '上灣村', variant: 'alternate' }],
      }),
    ])
  })
})

describe('normaliseDivisionRow hierarchy', () => {
  test('reclassifies Lok Ma Chau Loop without rewriting its Overture provenance', () => {
    const normalised = normaliseDivisionRow({
      admin_level: 2,
      id: '222b7818-970a-491d-98b6-b88d8c6f0161',
      names: { common: { en: 'Lok Ma Chau Loop', 'zh-hant': '落馬洲河套地區' } },
      parent_division_id: 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d',
      subtype: 'region',
    })

    expect(normalised.base).toMatchObject({
      id: '222b7818-970a-491d-98b6-b88d8c6f0161',
      level: 4,
      class: 'macrohood',
    })
    expect(normalised.overtureHongKongDivisionClassificationCorrection).toEqual({
      level: 4,
      class: 'macrohood',
    })
  })

  test('uses the corrected Lok Ma Chau Loop classification in a descendant hierarchy', () => {
    const normalised = normaliseDivisionRow(
      {
        id: 'c8488b42-3b2e-425b-8930-cce3fded69e2',
        names: { primary: 'Lok Ma Chau Loop' },
        parent_division_id: '222b7818-970a-491d-98b6-b88d8c6f0161',
        subtype: 'microhood',
        hierarchies: [
          {
            division_id: '222b7818-970a-491d-98b6-b88d8c6f0161',
            name: 'Lok Ma Chau Loop',
            subtype: 'region',
          },
        ],
      },
      {
        hierarchyLookup: new Map([
          [
            '222b7818-970a-491d-98b6-b88d8c6f0161',
            {
              i18n: {
                en: { name: 'Lok Ma Chau Loop' },
                'zh-hant': { name: '落馬洲河套地區' },
              },
              level: 4,
              class: 'macrohood',
            },
          ],
        ]),
      },
    )

    expect(normalised.base.hierarchies).toEqual({
      locality: [
        [
          {
            id: '222b7818-970a-491d-98b6-b88d8c6f0161',
            class: 'macrohood',
            name: '落馬洲河套地區 Lok Ma Chau Loop',
          },
        ],
      ],
      full: [
        [
          {
            id: '222b7818-970a-491d-98b6-b88d8c6f0161',
            class: 'macrohood',
            name: '落馬洲河套地區 Lok Ma Chau Loop',
          },
        ],
      ],
    })
  })

  test('retains the original Overture source record reference', () => {
    const normalised = normaliseDivisionRow({
      id: 'division-with-feature-version',
      subtype: 'locality',
      version: 42,
      sources: [
        {
          property: '/properties/id',
          dataset: 'overture',
          record_id: 'division-with-feature-version',
        },
      ],
    })

    expect(normalised.base.sources).toEqual({
      overture: [
        {
          property: '/properties/id',
          dataset: 'overture',
          record_id: 'division-with-feature-version',
        },
      ],
    })
  })

  test('normalises Overture hierarchy entries using division i18n lookup', () => {
    const normalised = normaliseDivisionRow(
      {
        id: '0058e21e-a916-4762-8da1-ba6694204a35',
        parent_division_id: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
        subtype: 'macrohood',
        names: {
          primary: '西營盤 Sai Ying Pun',
        },
        hierarchies: [
          [
            {
              division_id: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
              subtype: 'country',
              name: '中国',
            },
            {
              division_id: 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d',
              subtype: 'dependency',
              name: 'Hong Kong SAR',
            },
            {
              division_id: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
              subtype: 'region',
              name: '中西區 Central and Western District',
            },
            {
              division_id: '0058e21e-a916-4762-8da1-ba6694204a35',
              subtype: 'macrohood',
              name: '西營盤 Sai Ying Pun',
            },
          ],
        ],
      },
      { hierarchyLookup },
    )

    expect(normalised.base.hierarchies).toEqual({
      administrative: [
        [
          {
            id: 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d',
            class: 'sar',
            name: '香港特別行政區 Hong Kong SAR',
          },
          {
            id: 'ss-25cec859-44f3-5e1d-a72b-952f804e56ab',
            class: 'area',
            name: '香港島 Hong Kong Island',
          },
          {
            id: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
            class: 'district',
            name: '中西區 Central and Western District',
          },
        ],
      ],
      full: [
        [
          {
            id: 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d',
            class: 'sar',
            name: '香港特別行政區 Hong Kong SAR',
          },
          {
            id: 'ss-25cec859-44f3-5e1d-a72b-952f804e56ab',
            class: 'area',
            name: '香港島 Hong Kong Island',
          },
          {
            id: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
            class: 'district',
            name: '中西區 Central and Western District',
          },
        ],
      ],
    })
    expect(normalised.base.identifiers).toBeNull()
  })

  test('normalises locality hierarchy entries using division lookup', () => {
    const normalised = normaliseDivisionRow(
      {
        id: 'division-macrohood',
        parent_division_id: 'division-locality',
        subtype: 'macrohood',
        names: {
          primary: 'Example Macrohood',
        },
        hierarchies: [
          {
            division_id: 'division-locality',
            subtype: 'locality',
            name: 'Somewhere',
          },
        ],
      },
      {
        hierarchyLookup: new Map([
          [
            'division-locality',
            {
              i18n: {
                en: {
                  name: 'Somewhere',
                },
                'zh-hant': {
                  name: '某處',
                },
              },
              level: 3,
              class: 'town',
            },
          ],
        ]),
      },
    )

    expect(normalised.base.hierarchies).toEqual({
      locality: [[{ id: 'division-locality', class: 'town', name: '某處 Somewhere' }]],
      full: [[{ id: 'division-locality', class: 'town', name: '某處 Somewhere' }]],
    })
  })

  test('inserts an area after Hong Kong SAR for a district', () => {
    const normalised = normaliseDivisionRow(
      {
        id: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
        subtype: 'region',
        names: {
          common: {
            en: 'Central and Western District',
            'zh-hant': '中西區',
          },
        },
        hierarchies: [
          [
            {
              division_id: 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d',
              subtype: 'dependency',
              name: 'Hong Kong SAR',
            },
            {
              division_id: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
              subtype: 'region',
              name: 'Central and Western District',
            },
          ],
        ],
      },
      { hierarchyLookup },
    )

    expect(requireDefined(normalised.base.hierarchies.administrative)[0]).toMatchObject(
      [
        { class: 'sar' },
        { class: 'area', id: 'ss-25cec859-44f3-5e1d-a72b-952f804e56ab' },
      ],
    )
    expect(normalised.overtureHongKongAreaHierarchyAssignment).toMatchObject({
      code: 'hong-kong-island',
    })
  })

  test('rejects locality hierarchy entries missing from lookup', () => {
    expect(() =>
      normaliseDivisionRow(
        {
          id: 'division-town',
          parent_division_id: 'division-locality',
          subtype: 'macrohood',
          names: {
            primary: 'Example',
          },
          hierarchies: [
            {
              division_id: 'division-locality',
              subtype: 'locality',
              name: 'Somewhere',
            },
          ],
        },
        { hierarchyLookup },
      ),
    ).toThrow('Cannot normalise hierarchy locality entry division-locality')
  })
})

describe('buildOvertureHongKongDivisionClassificationProcessingActions', () => {
  test('records the Lok Ma Chau Loop correction in the release audit trail', () => {
    expect(
      buildOvertureHongKongDivisionClassificationProcessingActions(
        '222b7818-970a-491d-98b6-b88d8c6f0161',
      ),
    ).toEqual([
      expect.objectContaining({
        action: 'overture_hong_kong_lok_ma_chau_loop_reclassified',
        affectedRecordCount: 1,
        evidence: expect.objectContaining({
          canonical: { level: 4, class: 'macrohood' },
          divisionId: '222b7818-970a-491d-98b6-b88d8c6f0161',
        }),
        mode: 'automatic',
      }),
    ])
    expect(
      buildOvertureHongKongDivisionClassificationProcessingActions(
        '222b7818-970a-491d-98b6-b88d8c6f0161',
        0,
      ),
    ).toEqual([])
  })
})

describe('buildOvertureDivisionLocaleProcessingActions', () => {
  test('keeps per-division evidence for inferred and fallback locales', () => {
    const rawNames = {
      common: {
        zh_HK: '香港',
      },
      primary: 'Example',
    }
    const normalised = normaliseDivisionRow({
      id: 'division-audit',
      subtype: 'locality',
      class: 'city',
      names: rawNames,
    })
    const actions = buildOvertureDivisionLocaleProcessingActions({
      canonicalI18n: buildCanonicalDivisionApiI18n(normalised.i18n),
      division: normalised.base,
      rawNames,
      sourceI18n: normalised.i18n,
    })

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'overture_division_locale_inferred',
          affectedRecordCount: 1,
          evidence: expect.objectContaining({
            canonicalDivision: expect.objectContaining({ id: 'division-audit' }),
            inferredI18n: expect.arrayContaining([
              expect.objectContaining({ locale: 'en', name: 'Example' }),
            ]),
            sourceNames: rawNames,
          }),
        }),
        expect.objectContaining({
          action: 'overture_division_api_locale_fallback_added',
          affectedRecordCount: 1,
          evidence: expect.objectContaining({
            fallbackI18n: expect.arrayContaining([
              expect.objectContaining({
                locale: 'zh-hant',
                sourceLocale: 'zh-hk',
              }),
            ]),
          }),
        }),
      ]),
    )
  })

  test('does not write an audit action for direct canonical locales', () => {
    const normalised = normaliseDivisionRow({
      id: 'division-direct-locale',
      subtype: 'locality',
      class: 'city',
      names: {
        common: {
          en: 'Example',
          'zh-hans': '例子',
          'zh-hant': '例子',
        },
      },
    })

    expect(
      buildOvertureDivisionLocaleProcessingActions({
        canonicalI18n: buildCanonicalDivisionApiI18n(normalised.i18n),
        division: normalised.base,
        rawNames: null,
        sourceI18n: normalised.i18n,
      }),
    ).toEqual([])
  })

  test('does not classify a translated locale as an API-locale fallback', () => {
    const normalised = normaliseDivisionRow({
      id: 'division-translated-locale',
      subtype: 'locality',
      class: 'city',
      names: {
        common: {
          en: 'Pak Nai',
          'zh-hant': '白泥',
        },
      },
    })
    const sourceI18n = normalised.i18n
    const traditional = sourceI18n.find(row => row.locale === 'zh-hant')
    if (!traditional) throw new Error('Expected a Traditional Chinese source name.')
    const canonicalI18n = [
      ...sourceI18n,
      {
        ...traditional,
        locale: 'zh-hans',
        nameProvenance: 'ai-translated' as const,
      },
    ]

    expect(
      buildOvertureDivisionLocaleProcessingActions({
        canonicalI18n,
        division: normalised.base,
        rawNames: null,
        sourceI18n,
      }),
    ).toEqual([])
  })
})

describe('normaliseDivisionI18nForStorage', () => {
  test('makes an upstream-provided name match its persisted churn input', async () => {
    const incoming = [
      {
        divisionId: 'division-provenance',
        isLocaleInferred: false,
        locale: 'en',
        name: 'Example',
        nameAlts: null,
        nameRules: null,
        nameVariant: null,
      },
    ]
    const persisted = [
      expect.objectContaining({
        divisionId: 'division-provenance',
        locale: 'en',
        nameProvenance: 'provided',
      }),
    ]

    expect(normaliseDivisionI18nForStorage(incoming)).toEqual(persisted)
    expect(await createHash({ i18n: normaliseDivisionI18nForStorage(incoming) })).toBe(
      await createHash({
        i18n: [
          {
            ...incoming[0],
            nameProvenance: 'provided',
          },
        ],
      }),
    )
  })
})

describe('buildOvertureHongKongAreaHierarchyProcessingActions', () => {
  test('reports only each area count, not individual division assignments', () => {
    expect(
      buildOvertureHongKongAreaHierarchyProcessingActions(
        new Map([
          ['hong-kong-island', 37],
          ['new-territories', 82],
        ]),
      ),
    ).toEqual([
      expect.objectContaining({
        action: 'overture_division_hong_kong_area_hierarchy_assigned',
        affectedRecordCount: 37,
        evidence: {
          area: expect.objectContaining({ code: 'hong-kong-island' }),
        },
      }),
      expect.objectContaining({
        action: 'overture_division_hong_kong_area_hierarchy_assigned',
        affectedRecordCount: 82,
        evidence: {
          area: expect.objectContaining({ code: 'new-territories' }),
        },
      }),
    ])
  })
})
