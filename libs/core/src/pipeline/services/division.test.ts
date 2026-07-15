import { describe, expect, test } from 'bun:test'

import {
  collectOvertureHongKongDivisionSourceAssumptionViolations,
  type DivisionHierarchyLookup,
  normalizeDivisionRow,
} from './division'

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

describe('normalizeDivisionRow hierarchy', () => {
  test('retains a valid Overture FeatureVersion as a compatibility key', () => {
    const normalized = normalizeDivisionRow({
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

    expect(normalized.base.sourceKeys).toMatchObject({
      overture: { version: 42 },
    })
    expect(normalized.base.sources).toEqual({
      overture: [
        {
          property: '/properties/id',
          dataset: 'overture',
          record_id: 'division-with-feature-version',
        },
      ],
    })
  })

  test('normalizes Overture hierarchy entries using division i18n lookup', () => {
    const normalized = normalizeDivisionRow(
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

    expect(normalized.base.hierarchy).toEqual([
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
    expect(normalized.base.sourceKeys).toEqual({
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

  test('normalizes locality hierarchy entries using division lookup', () => {
    const normalized = normalizeDivisionRow(
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

    expect(normalized.base.hierarchy).toEqual([
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
      normalizeDivisionRow(
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
    ).toThrow('Cannot normalize hierarchy locality entry division-locality')
  })
})
