import { describe, expect, test } from 'bun:test'

import {
  buildCanonicalDivisionApiI18n,
  buildOvertureDivisionLocaleProcessingActions,
  collectOvertureHongKongDivisionSourceAssumptionViolations,
  type DivisionHierarchyLookup,
  normaliseDivisionRow,
} from './division'
import { getSupplementalDivisionFixtureRows } from './divisionFixtures'
import {
  missingOvertureHongKongAreaRows,
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
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
      type: 'sar',
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
      type: 'district',
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

  test('reports multiple hierarchy alternatives', () => {
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
    ).toEqual(['row 1 (district): expected at most one hierarchies entry, got 2'])
  })
})

describe('getSupplementalDivisionFixtureRows', () => {
  test('adds the PRC country anchor to Overture Hong Kong division snapshots', () => {
    const [fixture] = getSupplementalDivisionFixtureRows({
      source: 'overture',
      type: 'division',
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
        type: 'country',
        geometry: null,
      },
      i18n: expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'China' }),
        expect.objectContaining({ locale: 'zh-hant', name: '中國' }),
      ]),
    })
  })

  test('does not add the anchor to unrelated snapshots', () => {
    expect(
      getSupplementalDivisionFixtureRows({
        source: 'overture',
        type: 'divisionBoundary',
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

  test('reuses Overture’s historic Kowloon identity', () => {
    expect(overtureHongKongAreaDivisionId('kowloon')).toBe(
      '17009785-57fd-4e5b-af86-2d27352e4718',
    )
  })

  test('synthesises each missing Hong Kong level-1 area from its district members', () => {
    const rows = missingOvertureHongKongAreaRows(
      { regionCode: 'hk', source: 'overture', type: 'division' },
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

  test('does not replace an Overture-provided polygonal area record', () => {
    const rows = missingOvertureHongKongAreaRows(
      { regionCode: 'hk', source: 'overture', type: 'division' },
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

    expect(rows.map(row => row.names.primary)).not.toContain('Kowloon')
  })

  test('replaces an Overture area point with the canonical synthetic area', () => {
    const rows = missingOvertureHongKongAreaRows(
      { regionCode: 'hk', source: 'overture', type: 'division' },
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

    expect(
      rows.find(row => row.id === '17009785-57fd-4e5b-af86-2d27352e4718'),
    ).toMatchObject({
      geometry: null,
      names: { primary: 'Kowloon' },
      wikidata: 'Q239143',
    })
  })
})

describe('normaliseDivisionRow i18n', () => {
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
        sourceKeys: {
          hkgovLandsd: {
            district: 'CW',
            geoNameId: '101',
            placeClass: 'Settlement',
            placeType: 'Town',
          },
        },
        sources: {
          hkgovLandsd: {
            properties: { GEO_NAME_ID: '101', PLACE_CLASS: 'Settlement' },
          },
        },
        type: 'settlement',
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
  test('retains a valid Overture FeatureVersion as a compatibility key', () => {
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

    expect(normalised.base.sourceKeys).toMatchObject({
      overture: { version: 42 },
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

    expect(normalised.base.hierarchy).toEqual([
      {
        division_id: 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d',
        i18n: {
          en: {
            name: 'Hong Kong SAR',
          },
          'zh-hant': {
            name: '香港特別行政區',
          },
        },
        level: 0,
        type: 'sar',
      },
      {
        division_id: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
        i18n: {
          en: {
            name: 'Central and Western District',
          },
          'zh-hant': {
            name: '中西區',
          },
        },
        level: 2,
        type: 'district',
      },
    ])
    expect(normalised.base.sourceKeys).toEqual({
      overture: {
        subtype: 'macrohood',
        class: '',
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
    })
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
              type: 'town',
            },
          ],
        ]),
      },
    )

    expect(normalised.base.hierarchy).toEqual([
      {
        division_id: 'division-locality',
        i18n: {
          en: {
            name: 'Somewhere',
          },
          'zh-hant': {
            name: '某處',
          },
        },
        level: 3,
        type: 'town',
      },
    ])
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
})
