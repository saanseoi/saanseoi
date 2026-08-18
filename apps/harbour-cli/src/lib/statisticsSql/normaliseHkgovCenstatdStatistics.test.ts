import { describe, expect, test } from 'bun:test'

import {
  normaliseHkgovCenstatdStatistics,
  persistedCanonicalObservation,
} from './normaliseHkgovCenstatdStatistics.ts'

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
        sourceFeatureId: 'DC_GHS:11-2016',
        sourceReleaseId: 'release-compilation-2026-q2',
        sourceVersion: '2026-Q2',
      },
    ])

    expect(rows.observations).toEqual([
      expect.objectContaining({
        measureCode: 'my_lp',
        referencePeriodCode: '2016',
        sourceValue: '243300',
      }),
    ])
    expect(rows.series).toEqual([
      expect.objectContaining({
        referencePeriodCode: '2016',
        sourceFeatureId: 'DC_GHS:11-2016',
      }),
    ])
    expect(rows.seriesDimensions).toHaveLength(2)
  })

  test('uses half-year periods and preserves suppression literals', () => {
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
        sourceFeatureId: 'DCD_LQ_Q32023:11',
        sourceReleaseId: 'release-2023-h2',
        sourceVersion: '2023-H2',
      },
    ])

    expect(rows.observations[0]).toMatchObject({
      numericValue: null,
      observationStatus: 'suppressed',
      referencePeriodCode: '2023-H2',
      sourceValue: '**',
      valueCode: 'suppressed',
    })
  })

  test('stores density population as actual people without a multiplier', () => {
    const rows = normaliseHkgovCenstatdStatistics([
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
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
        sourceFeatureId: 'Density_2024:11',
        sourceReleaseId: 'release-2024',
        sourceVersion: '2024',
      },
    ])

    expect(rows.observations).toContainEqual(
      expect.objectContaining({
        measureCode: 'MYPOPN_LAND',
        numericValue: '243300',
        sourceValue: '243.3',
        unitCode: 'person',
      }),
    )
    expect(rows.series).toContainEqual(
      expect.objectContaining({ divisionId: 'district-central-western' }),
    )
  })

  test('uses reviewed measure metadata without changing publisher literals', () => {
    const rows = normaliseHkgovCenstatdStatistics(
      [
        {
          datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
          properties: { AREA: '12' },
          sourceFeatureId: 'example:1',
          sourceReleaseId: 'release-example',
          sourceVersion: '2026',
        },
      ],
      {
        measureMetadata: new Map([
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
              measureCode: 'landArea',
              sourceNullOption: 'Null',
              unitCode: 'square-kilometre',
            },
          ],
        ]),
      },
    )

    expect(rows.measures).toContainEqual(
      expect.objectContaining({
        measureCode: 'landArea',
        sourceField: 'AREA',
        sourceNullOption: 'Null',
        unitCode: 'square-kilometre',
      }),
    )
    expect(rows.measuresI18n).toContainEqual(
      expect.objectContaining({
        description: 'Land area represented by the publisher feature.',
        name: 'Land area',
      }),
    )
    expect(rows.observations).toContainEqual(
      expect.objectContaining({
        measureCode: 'landArea',
        sourceField: 'AREA',
        sourceValue: '12',
        unitCode: 'square-kilometre',
      }),
    )
    expect(rows.measuresI18n).toEqual(
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

  test('does not write a series period into an observation row', () => {
    const [observation] = normaliseHkgovCenstatdStatistics([
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
        sourceFeatureId: 'Density_2024:11',
        sourceReleaseId: 'release-2024',
        sourceVersion: '2024',
      },
    ]).observations

    expect(observation?.referencePeriodCode).toBe('2024')
    if (!observation) throw new Error('Expected a canonical observation.')
    expect(persistedCanonicalObservation(observation)).not.toHaveProperty(
      'referencePeriodCode',
    )
  })
})
