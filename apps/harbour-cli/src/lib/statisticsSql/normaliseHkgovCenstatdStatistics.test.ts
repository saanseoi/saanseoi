import { describe, expect, test } from 'bun:test'

import { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics.ts'

describe('normaliseHkgovCenstatdStatistics', () => {
  test('retains a compilation row’s own annual reference period', () => {
    const rows = normaliseHkgovCenstatdStatistics([
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        properties: {
          dc: '11',
          dc_chi: '中西區',
          dc_class: 'A',
          dc_eng: 'Central and Western',
          my_lp: '243300',
          year: '2016',
        },
        sourceFeatureRef: 'DC_GHS:11-2016',
        sourceReleaseId: 'release-compilation-2026-q2',
        sourceVersion: '2026-Q2',
      },
    ])

    expect(rows.observations).toEqual([
      expect.objectContaining({
        fieldName: 'my_lp',
        referencePeriodCode: '2016',
        sourceValue: '243300',
      }),
    ])
    expect(rows.records).toEqual([
      expect.objectContaining({
        referencePeriodCode: '2016',
        sourceFeatureRef: 'DC_GHS:11-2016',
      }),
    ])
    expect(rows.records).toHaveLength(1)
  })

  test('uses the row quarter and preserves suppression literals', () => {
    const rows = normaliseHkgovCenstatdStatistics([
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district',
        properties: {
          DC: '11',
          DC_CHI: '中西區',
          DC_ENG: 'Central and Western',
          LQ: '**',
          QUARTER: '3',
          YEAR: '2023',
        },
        sourceFeatureRef: 'DCD_LQ_Q32023:11',
        sourceReleaseId: 'release-2023-h2',
        sourceVersion: '2023-H2',
      },
    ])

    expect(rows.observations[0]).toMatchObject({
      numericValue: null,
      observationStatus: 'suppressed',
      referencePeriodCode: '2023-Q3',
      sourceValue: '**',
      valueCode: 'suppressed',
    })
  })

  test('keeps Major Housing Estate GML references out of statistics', () => {
    const rows = normaliseHkgovCenstatdStatistics([
      {
        datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
        properties: {
          estate: '1',
          estate_chi: '測試屋苑',
          estate_eng: 'Example Estate',
          gml_id: 'MHE_21C.1',
          t_pop: '1000',
        },
        sourceFeatureRef: 'MHE_21C:1',
        sourceReleaseId: 'release-2021',
        sourceVersion: '2021',
      },
    ])

    expect(rows.observations).toEqual([
      expect.objectContaining({ sourceField: 't_pop', sourceValue: '1000' }),
    ])
    expect(rows.records).toEqual([
      expect.objectContaining({
        geography: { code: '1', kind: 'housing-estate' },
        values: { t_pop: '1000' },
      }),
    ])
  })

  test('stores density population as actual people without a multiplier', () => {
    const rows = normaliseHkgovCenstatdStatistics([
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
        geography: { code: 'CW', kind: 'district' },
        divisionId: 'district-central-western',
        properties: {
          DC: '11',
          DC_CHI: '中西區',
          DC_ENG: 'Central and Western',
          LA: '12.4',
          MYPOPN_LAND: '243.3',
          PERIOD: '2024',
          POPN_D: '19620',
        },
        sourceFeatureRef: 'Density_2024:11',
        sourceReleaseId: 'release-2024',
        sourceVersion: '2024',
      },
    ])

    expect(rows.observations).toContainEqual(
      expect.objectContaining({
        fieldName: 'MYPOPN_LAND',
        numericValue: '243300',
        sourceValue: '243.3',
        unitCode: 'person',
        valuePrecision: '100',
      }),
    )
    expect(rows.records).toContainEqual(
      expect.objectContaining({ divisionId: 'district-central-western' }),
    )
    expect(rows.records).toEqual([
      expect.objectContaining({
        geography: { code: 'CW', kind: 'district' },
        dimensions: {},
        values: expect.objectContaining({
          LA: '12.4',
          MYPOPN_LAND: '243300',
          POPN_D: '19620',
        }),
      }),
    ])
  })

  test('uses reviewed field metadata without changing publisher literals', () => {
    const rows = normaliseHkgovCenstatdStatistics(
      [
        {
          datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
          properties: { AREA: '12' },
          sourceFeatureRef: 'example:1',
          sourceReleaseId: 'release-example',
          sourceVersion: '2026',
        },
      ],
      {
        fieldMetadata: new Map([
          [
            'ds-hk-hkgov-censtatd-division-statistic-example\u0000AREA',
            {
              localisations: [
                {
                  description: 'Land area represented by the publisher feature.',
                  isTranslationVerified: true,
                  locale: 'en',
                  name: 'Land area',
                },
                {
                  description: '土地面積。',
                  isTranslationVerified: true,
                  locale: 'zh-Hant',
                  name: '土地面積',
                },
                {
                  description: '土地面积。',
                  isTranslationVerified: false,
                  locale: 'zh-Hans',
                  name: '土地面积',
                },
              ],
              aggregation: 'median',
              aggregationPercentile: 50,
              comparability: {
                affectedReferencePeriods: ['2011', '2016'],
                reason: 'economic-activity-status-classification-changed',
                status: 'caution',
              },
              statisticKind: 'quantity',
              fieldName: 'landArea',
              measureCode: 'landArea',
              dimensions: {},
              sourceNullOption: 'Null',
              unitCode: 'square-kilometre',
            },
          ],
        ]),
      },
    )

    expect(rows.fields).toContainEqual(
      expect.objectContaining({
        fieldName: 'landArea',
        dimensions: {},
        aggregation: 'median',
        aggregationPercentile: 50,
        comparability: {
          affectedReferencePeriods: ['2011', '2016'],
          reason: 'economic-activity-status-classification-changed',
          status: 'caution',
        },
        statisticKind: 'quantity',
        sourceField: 'AREA',
        sourceNullOption: 'Null',
        unitCode: 'square-kilometre',
      }),
    )
    expect(rows.fieldsI18n).toContainEqual(
      expect.objectContaining({
        description: 'Land area represented by the publisher feature.',
        name: 'Land area',
      }),
    )
    expect(rows.observations).toContainEqual(
      expect.objectContaining({
        fieldName: 'landArea',
        sourceField: 'AREA',
        sourceValue: '12',
        unitCode: 'square-kilometre',
      }),
    )
    expect(rows.fieldsI18n).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Land area' }),
        expect.objectContaining({ locale: 'zh-Hant', name: '土地面積' }),
        expect.objectContaining({
          isTranslationVerified: false,
          locale: 'zh-Hans',
          name: '土地面积',
        }),
      ]),
    )
  })

  test('packs a feature’s values and dimensions into one canonical record', () => {
    const [record] = normaliseHkgovCenstatdStatistics([
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
        properties: {
          DC: '11',
          DC_CHI: '中西區',
          DC_ENG: 'Central and Western',
          LA: '12.4',
          PERIOD: '2024',
        },
        sourceFeatureRef: 'Density_2024:11',
        sourceReleaseId: 'release-2024',
        sourceVersion: '2024',
      },
    ]).records

    expect(record).toMatchObject({
      referencePeriodCode: '2024',
      dimensions: {},
      values: {
        LA: '12.4',
      },
    })
  })

  test('groups fields only when their curated analytical dimensions match', () => {
    const rows = normaliseHkgovCenstatdStatistics(
      [
        {
          datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
          properties: { ALL: '10', FEMALE: '6', MALE: '4' },
          sourceFeatureRef: 'hkgov-censtatd/example/2024/Example:1',
          sourceReleaseId: 'release-example',
          sourceVersion: '2024',
        },
      ],
      {
        fieldMetadata: new Map([
          [
            'ds-hk-hkgov-censtatd-division-statistic-example\u0000ALL',
            {
              aggregation: 'total' as const,
              dimensions: { sex: 'all' },
              fieldName: 'populationAll',
              measureCode: 'population',
              localisations: [],
              statisticKind: 'count' as const,
              unitCode: 'person',
            },
          ],
          [
            'ds-hk-hkgov-censtatd-division-statistic-example\u0000FEMALE',
            {
              aggregation: 'total' as const,
              dimensions: { sex: 'female' },
              fieldName: 'populationFemale',
              measureCode: 'population',
              localisations: [],
              statisticKind: 'count' as const,
              unitCode: 'person',
            },
          ],
          [
            'ds-hk-hkgov-censtatd-division-statistic-example\u0000MALE',
            {
              aggregation: 'total' as const,
              dimensions: { sex: 'female' },
              fieldName: 'populationMale',
              measureCode: 'population',
              localisations: [],
              statisticKind: 'count' as const,
              unitCode: 'person',
            },
          ],
        ]),
      },
    )

    expect(rows.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimensions: { sex: 'all' },
          values: { populationAll: '10' },
        }),
        expect.objectContaining({
          dimensions: { sex: 'female' },
          values: { populationFemale: '6', populationMale: '4' },
        }),
      ]),
    )
    expect(rows.records).toHaveLength(2)
  })
})
