import { describe, expect, test } from 'bun:test'

import { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics.ts'
import {
  loadCenstatdFieldCuration,
  loadCenstatdMeasureMetadata,
  resolveCenstatdFieldCuration,
} from './censtatdMeasureCuration.ts'

describe('normaliseHkgovCenstatdStatistics', () => {
  test('retains a compilation row’s own annual reference period', () => {
    const rows = normaliseHkgovCenstatdStatistics([
      {
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
        areaCompanionByReferencePeriod: {
          '*': {
            variant: 'hkgov-censtatd',
            domainCode: 'geographic',
            cohortKey: '{referencePeriodEndYear}',
          },
        },
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
        geography: {
          code: '11',
          kind: 'district',
          class: 'A',
          areaCompanion: {
            variant: 'hkgov-censtatd',
            domainCode: 'geographic',
            cohortKey: '2016',
          },
        },
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
              periodicity: 'month',
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
        periodicity: 'month',
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

  test('packs a feature’s dimension-qualified values into one canonical record', () => {
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
      values: {
        LA: '12.4',
      },
    })
  })

  test('packs all curated analytical dimensions together and preserves field definitions', () => {
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
              dimensions: { sex: 'male' },
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

    expect(rows.records).toEqual([
      expect.objectContaining({
        values: { populationAll: '10', populationFemale: '6', populationMale: '4' },
      }),
    ])
    expect(rows.records[0]).not.toHaveProperty('dimensions')
    expect(rows.fields.map(field => field.dimensions)).toEqual([
      { sex: 'all' },
      { sex: 'female' },
      { sex: 'male' },
    ])
    for (const field of rows.fields) {
      expect(rows.records[0]?.fieldDefinitionHashes[field.fieldName]).toBe(
        field.versionHash,
      )
      expect(rows.records[0]?.fieldSources[field.fieldName]).toEqual({
        sourceFeatureRef: 'hkgov-censtatd/example/2024/Example:1',
        sourceReleaseId: 'release-example',
      })
    }
  })

  test('packs the 69 reviewed building-group dimension combinations into one geography/period record', async () => {
    const datasetCode =
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
    const registry = await loadCenstatdFieldCuration()
    const curated = registry.fields.filter(field => field.datasetCode === datasetCode)
    expect(new Set(curated.map(field => JSON.stringify(field.dimensions))).size).toBe(
      69,
    )
    const input = [
      {
        datasetCode,
        properties: {
          hma: '01',
          bg: '01',
          bg_ind: 'A',
          ...Object.fromEntries(curated.map(field => [field.sourceField, '12'])),
        },
        sourceFeatureRef: 'hkgov-censtatd/building-groups/2021/BG:01',
        sourceReleaseId: 'release-2021',
        sourceVersion: '2021',
      },
    ]
    const discovery = normaliseHkgovCenstatdStatistics(input)
    const { metadata } = resolveCenstatdFieldCuration({
      registry,
      fields: discovery.fields,
    })
    const canonical = normaliseHkgovCenstatdStatistics(input, {
      fieldMetadata: metadata,
      measureMetadata: await loadCenstatdMeasureMetadata(),
    })
    expect(canonical.records).toHaveLength(1)
    expect(canonical.observations).toHaveLength(curated.length)
    expect(Object.keys(canonical.records[0]?.values ?? {})).toHaveLength(curated.length)
    expect(canonical.records[0]?.geography).toEqual({
      kind: 'building-group',
      code: '01',
      class: 'A',
      namespace: 'housing-market-area:01',
    })
  })

  test('record identity excludes publication versions and geometry companion vintages', () => {
    const datasetCode =
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
    const row = {
      datasetCode,
      properties: { dc: '11', dc_class: 'A', year: '2021', my_lp: '123' },
      sourceFeatureRef: `hkgov-censtatd/${datasetCode}/2024/DC:11`,
      sourceReleaseId: 'release-2024',
      sourceVersion: '2024',
      geography: {
        kind: 'district',
        code: 'CW',
        areaCompanion: {
          cohortKey: '2021',
          domainCode: 'administrative',
          variant: 'hkgov-censtatd',
        },
      },
    }
    const first = normaliseHkgovCenstatdStatistics([row]).records[0]
    const revised = normaliseHkgovCenstatdStatistics([
      {
        ...row,
        geography: {
          ...row.geography,
          areaCompanion: { ...row.geography.areaCompanion, cohortKey: '2022' },
        },
        properties: { ...row.properties, my_lp: '124' },
        sourceFeatureRef: `hkgov-censtatd/${datasetCode}/2026-Q2/DC_GHS:11`,
        sourceReleaseId: 'release-2026',
        sourceVersion: '2026-Q2',
      },
    ]).records[0]
    expect(revised?.id).toBe(first?.id)
    expect(revised?.referencePeriodCode).toBe('2021')
    expect(revised?.fieldSources).not.toEqual(first?.fieldSources)
  })

  test('separates semantic geography, dataset, exact period and parent namespace', () => {
    const datasetCode =
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
    const base = {
      datasetCode,
      properties: { AREA_ENG: 'District', PERIOD: '2024-Q1', LQ: '12' },
      sourceFeatureRef: 'publisher/ref',
      sourceReleaseId: 'release',
      sourceVersion: '2024',
      geography: { kind: 'district', code: '11', class: 'A', namespace: 'first' },
    }
    const inputs = [
      base,
      { ...base, geography: { ...base.geography, kind: 'area' } },
      { ...base, geography: { ...base.geography, code: '12' } },
      { ...base, geography: { ...base.geography, class: 'B' } },
      { ...base, geography: { ...base.geography, namespace: 'second' } },
      { ...base, properties: { ...base.properties, PERIOD: '2024-Q2' } },
      { ...base, datasetCode: 'another-dataset' },
    ]
    const ids = inputs.map(
      input => normaliseHkgovCenstatdStatistics([input]).records[0]?.id,
    )
    expect(new Set(ids).size).toBe(inputs.length)
  })

  test('merges disjoint source fields but rejects conflicting duplicate source variants', () => {
    const base = {
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
      properties: { population: '12' },
      sourceFeatureRef: 'publisher/first',
      sourceReleaseId: 'release',
      sourceVersion: '2024',
      geography: { kind: 'district', code: '11' },
    }
    const second = {
      ...base,
      sourceFeatureRef: 'publisher/second',
      properties: { households: '4' },
    }
    const rows = normaliseHkgovCenstatdStatistics([base, second])
    expect(rows.records).toHaveLength(1)
    expect(rows.observations).toHaveLength(2)
    expect(rows.records[0]?.values).toEqual({ population: '12', households: '4' })
    expect(rows.records[0]?.fieldSources.households?.sourceFeatureRef).toBe(
      'publisher/second',
    )
    expect(() =>
      normaliseHkgovCenstatdStatistics([
        base,
        { ...second, properties: { population: '13' } },
      ]),
    ).toThrow('duplicate field population')
    expect(() =>
      normaliseHkgovCenstatdStatistics([
        base,
        { ...second, divisionId: 'different-division' },
      ]),
    ).toThrow('conflicting geography metadata')
  })

  test('suppression does not revise numeric field definitions', () => {
    const base = {
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
      properties: { population: '12' },
      sourceFeatureRef: 'publisher/first',
      sourceReleaseId: 'release',
      sourceVersion: '2024',
      geography: { kind: 'district', code: '11' },
    }
    const original = normaliseHkgovCenstatdStatistics([base])
    const suppressed = normaliseHkgovCenstatdStatistics([
      {
        ...base,
        properties: { population: '**' },
        sourceReleaseId: 'correction',
      },
    ])
    expect(suppressed.fields[0]?.valueKind).toBe('numeric')
    expect(suppressed.fields[0]?.versionHash).toBe(original.fields[0]?.versionHash)
  })
})
