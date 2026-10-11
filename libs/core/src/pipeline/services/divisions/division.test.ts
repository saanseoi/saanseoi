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
  normaliseDivisionRow,
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
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    })
    for (const [id, name, zhHant, coordinates] of [
      [
        '7a719ce4-ef50-5a85-9f9a-1d0375c3eeaa',
        'Kai Tak Sports Park',
        '啟德體育園',
        [114.1978125, 22.3236344],
      ],
      [
        'f8470431-cc49-5c1a-9c97-7b75f809f125',
        'Kai Tak Metro Park',
        '啟德都會公園',
        [114.1996688, 22.318758],
      ],
      [
        'c96f4670-4aba-566f-85e2-e7bfd905fa49',
        'Kai Tak Cruise Terminal',
        '啟德郵輪碼頭',
        [114.2120721, 22.3070126],
      ],
    ] as const) {
      const row = rows.find(row => row.id === id)!
      expect(row.parent_division_id).toBe('537c8fc4-5ea5-40e8-bdb1-825d93d45059')
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

  test('adds Lan Kwai Fong as a reviewed microhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '86e53121-284a-5640-aaa3-bc28a3703ff7')!
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

  test('adds Thirty Houses as a reviewed Sheung Wan microhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'f6207b8e-e4a4-54a2-9c1b-0a9a6291447e')!
    expect(row.parent_division_id).toBe('64a1b3b8-ee9e-4193-bc22-e5abca06cf1c')
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'microhood',
        geometry: { type: 'Point', coordinates: [114.1511702, 22.2833691] },
        level: 6,
        wikidata: 'Q10905033',
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({
          locale: 'en',
          name: 'Thirty Houses',
          nameAlts: '30 Houses',
        }),
        expect.objectContaining({
          locale: 'zh-hant',
          name: '卅間',
          nameAlts: '三十間',
        }),
      ]),
    })
  })

  test('adds Tai Tam Gap as a reviewed Eastern District neighbourhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '7a3c5e91-95c2-5c93-8e3c-7d5b5d3bb6e7')!
    expect(row.parent_division_id).toBe('01b58985-268d-4b8a-8e09-64604668b13e')
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'neighbourhood',
        geometry: { type: 'Point', coordinates: [114.2281758, 22.2574719] },
        level: 5,
        wikidata: 'Q10936624',
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Tai Tam Gap' }),
        expect.objectContaining({ locale: 'zh-hant', name: '大潭峽' }),
        expect.objectContaining({ locale: 'zh-hans', name: '大潭峡' }),
      ]),
    })
  })

  test('adds Tai Tam Tau as a reviewed Southern District microhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '1105e168-19e9-5c1c-abda-588f9f15d84c')!
    expect(row.parent_division_id).toBe('1dff7a5f-afe1-4db2-8ca7-cda8bb25754a')
    expect(row.sources).toContainEqual({
      dataset: 'OpenStreetMap',
      record_id: 'node/1128001275',
    })
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'microhood',
        geometry: { type: 'Point', coordinates: [114.2187883, 22.1951389] },
        level: 6,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Tai Tam Tau' }),
        expect.objectContaining({ locale: 'zh-hant', name: '大潭頭' }),
        expect.objectContaining({ locale: 'zh-hans', name: '大潭头' }),
      ]),
    })
  })

  test('adds Cape Collinson as a reviewed Eastern District neighbourhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '0ae98281-dc7d-52f3-861d-dd47af906fe1')!
    expect(row.parent_division_id).toBe('01b58985-268d-4b8a-8e09-64604668b13e')
    expect(row.sources).toContainEqual({
      dataset: 'OpenStreetMap',
      record_id: 'node/8736436992',
    })
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'neighbourhood',
        geometry: { type: 'Point', coordinates: [114.2453662, 22.2582498] },
        level: 5,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Cape Collinson' }),
        expect.objectContaining({ locale: 'zh-hant', name: '歌連臣角' }),
        expect.objectContaining({ locale: 'zh-hans', name: '歌连臣角' }),
      ]),
    })
  })

  test('adds Hok Tsui Lower Village as a reviewed Southern District hamlet', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '182d0a4c-99b4-5811-bd28-15d5c3bc339d')!
    expect(row.parent_division_id).toBe('1dff7a5f-afe1-4db2-8ca7-cda8bb25754a')
    expect(row.sources).toContainEqual({
      dataset: 'OpenStreetMap',
      record_id: 'node/2741299690',
    })
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
          name: '鶴咀村',
          nameAlts: '鶴咀下村',
        }),
        expect.objectContaining({
          locale: 'zh-hans',
          name: '鹤咀村',
          nameAlts: '鹤咀下村',
        }),
      ]),
    })
  })

  test('adds Sandy Bay Gap as a reviewed Central and Western District microhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '7bf6763f-7384-5233-8568-a24c10789432')!
    expect(row.parent_division_id).toBe('8d17afe0-5631-49c5-b86d-d53c5d4b2f9d')
    expect(row.sources).toContainEqual({
      dataset: 'OpenStreetMap',
      record_id: 'node/9520791845',
    })
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: {
        class: 'microhood',
        geometry: { type: 'Point', coordinates: [114.1293839, 22.2758724] },
        level: 6,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Sandy Bay Gap' }),
        expect.objectContaining({ locale: 'zh-hant', name: '沙灣坳' }),
        expect.objectContaining({ locale: 'zh-hans', name: '沙湾坳' }),
      ]),
    })
  })

  test('adds Lei Cheng Uk under Sham Shui Po', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '3fc693e1-2038-58e4-8ef3-8ce7b01e97a8')!
    expect(row.parent_division_id).toBe('73e4cfa9-558b-4017-84a3-f5c0b3507aa5')
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Lei Cheng Uk' }),
        expect.objectContaining({ locale: 'zh-hant', name: '李鄭屋' }),
      ]),
    })
  })
  test('adds Austin as a reviewed neighbourhood under Yau Tsim Mong', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '2cfb80d9-7390-5474-962d-d33c6d08c04d')!
    expect(row.parent_division_id).toBe('c8ca7da1-2688-402a-8eb9-199b69b5691c')
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Austin' }),
        expect.objectContaining({ locale: 'zh-hant', name: '柯士甸' }),
      ]),
    })
    expect(row.sources).toEqual([
      { dataset: 'SaanSeoi reviewed neighbourhood additions', record_id: 'austin' },
    ])
  })
  test('adds Jordan as a reviewed neighbourhood under Yau Tsim Mong', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'b3809d1e-fdac-5cd5-9a06-9ab9a5859491')!
    expect(row.parent_division_id).toBe('c8ca7da1-2688-402a-8eb9-199b69b5691c')
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Jordan' }),
        expect.objectContaining({ locale: 'zh-hant', name: '佐敦' }),
      ]),
    })
    expect(row.sources).toEqual([
      { dataset: 'SaanSeoi reviewed neighbourhood additions', record_id: 'jordan' },
    ])
  })
  test('adds Prince Edward as a reviewed neighbourhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '98d5760d-f07a-5c44-9ae4-847efd8dc408')!
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Prince Edward' }),
        expect.objectContaining({ locale: 'zh-hant', name: '太子' }),
      ]),
    })
    expect(row.sources).toEqual([
      {
        dataset: 'SaanSeoi reviewed neighbourhood additions',
        record_id: 'prince-edward',
      },
    ])
  })
  test('adds reviewed Waterfall Bay as a neighbourhood with SaanSeoi provenance', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'b74bf860-5daf-50fb-8382-84975c7c8be0')!
    expect(row.sources).toEqual([
      {
        dataset: 'SaanSeoi reviewed neighbourhood additions',
        record_id: 'waterfall-bay',
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

  test('adds reviewed Sheung and Ha Yuen Leng divisions under Wong Tai Sin', () => {
    const rows = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    })
    for (const [id, name, zhHant, classification, level, coordinates, recordId] of [
      [
        '00c5bf41-782b-5eea-8e1f-9c3c94dfe6e9',
        'Sheung Yuen Leng',
        '上元嶺',
        'neighbourhood',
        5,
        [114.2059129, 22.3415699],
        'node/4503903852',
      ],
      [
        '5b8a5036-d099-53d2-81a3-7be83837766f',
        'Ha Yuen Leng',
        '下元嶺',
        'microhood',
        6,
        [114.204061, 22.338932],
        'node/5104835121',
      ],
    ] as const) {
      const row = rows.find(row => row.id === id)!
      expect(row).toMatchObject({
        parent_division_id: '8cb650f2-5721-4c32-bb57-330ecc13987d',
        geometry: { type: 'Point', coordinates },
        sources: expect.arrayContaining([
          { dataset: 'OpenStreetMap', record_id: recordId },
        ]),
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

  test('adds Cha Liu Au as a reviewed Kwun Tong level-4 macrohood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === '3c8839d0-9013-5e3f-8669-0ad60ed5eeb4')!
    expect(row).toMatchObject({
      parent_division_id: 'cf79b69e-8575-4e9b-b15a-a4a8901e685b',
      geometry: { type: 'Point', coordinates: [114.2250772, 22.3341772] },
      sources: expect.arrayContaining([
        { dataset: 'OpenStreetMap', record_id: 'node/7688146514' },
      ]),
    })
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'macrohood', level: 4 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Cha Liu Au' }),
        expect.objectContaining({ locale: 'zh-hant', name: '茶寮坳' }),
      ]),
    })
  })

  test('adds Ping Shan as a reviewed Kwun Tong level-5 neighbourhood', () => {
    const row = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    }).find(row => row.id === 'e4500843-e738-4b02-a64c-fa5f4af63263')!
    expect(row).toMatchObject({
      parent_division_id: 'cf79b69e-8575-4e9b-b15a-a4a8901e685b',
      geometry: { type: 'Point', coordinates: [114.2188153, 22.3307477] },
      sources: expect.arrayContaining([
        { dataset: 'OpenStreetMap', record_id: 'node/3192519568' },
      ]),
    })
    expect(normaliseDivisionRow(row)).toMatchObject({
      base: { class: 'neighbourhood', level: 5 },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Ping Shan' }),
        expect.objectContaining({ locale: 'zh-hant', name: '平山' }),
      ]),
    })
  })

  test('adds the PRC country anchor to Overture Hong Kong division snapshots', () => {
    const [fixture] = getSupplementalDivisionFixtureRows({
      source: 'overture',
      resourceType: 'division',
      regionCode: 'hk',
    })

    expect(fixture).toEqual(
      expect.objectContaining({
        id: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
        subtype: 'country',
        geometry: null,
      }),
    )
    expect(normaliseDivisionRow(fixture ?? {})).toMatchObject({
      base: {
        id: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
        level: 0,
        class: 'country',
        geometry: null,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'China' }),
        expect.objectContaining({ locale: 'zh-hant', name: '中國' }),
      ]),
    })
    expect(
      getSupplementalDivisionFixtureRows(
        { source: 'overture', resourceType: 'division', regionCode: 'hk' },
        [{ id: 'island', class: 'minor_island' }],
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'island' })]))
  })

  test('does not add the anchor to unrelated snapshots', () => {
    expect(
      getSupplementalDivisionFixtureRows({
        source: 'overture',
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
      expect(row?.identifiers).toMatchObject({ wikidata: { id: area.wikidata } })
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
          evidence: [{ record_id: 'LANDSD:101' }],
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
            id: '25cec859-44f3-5e1d-a72b-952f804e56ab',
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
            id: '25cec859-44f3-5e1d-a72b-952f804e56ab',
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
      [{ class: 'sar' }, { class: 'area', id: '25cec859-44f3-5e1d-a72b-952f804e56ab' }],
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
          source: { adminLevel: 2, class: null, subtype: 'region' },
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
