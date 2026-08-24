import { expect, test } from 'bun:test'

import {
  emptyCenstatdFieldCuration,
  formatCenstatdFieldProposal,
  formatCenstatdFieldReviewContext,
  loadCenstatdFieldCuration,
  parseCenstatdFieldCuration,
  parseCsdiSimplifiedDataSpecification,
  resolveChineseLocalisationProposals,
  resolveUnitLocalisations,
  resolveCenstatdFieldCuration,
  suggestAggregation,
  suggestAggregationPercentile,
  suggestSeriesFieldMetadata,
  suggestStatisticKind,
  suggestUnitCode,
  suggestMeasureName,
  validAggregationsForStatisticKind,
} from './censtatdMeasureCuration.ts'

test('curates C&SD analytical dimensions without turning scalar statistics into dimensions', async () => {
  const registry = await loadCenstatdFieldCuration()
  const dimensionsFor = (datasetCode: string, sourceField: string) =>
    registry.fields.find(
      field => field.datasetCode === datasetCode && field.sourceField === sourceField,
    )?.dimensions

  expect(
    dimensionsFor(
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
      'nm_f',
    ),
  ).toEqual({
    'age-group': '15-and-over',
    'marital-status': 'never-married',
    sex: 'female',
  })
  expect(
    dimensionsFor(
      'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
      'readeng_ablepctn',
    ),
  ).toEqual({
    'age-group': '5-and-over',
    'literacy-language': 'english',
    'literacy-skill': 'reading',
  })
  expect(
    dimensionsFor('ds-hk-hkgov-censtatd-division-statistic-new-towns', 'dhi_e3'),
  ).toEqual({
    'foreign-domestic-helper': 'excluded',
    'household-economic-activity': 'economically-active',
    'monthly-income-band': 'hkd-10-000-to-19-999',
  })
  expect(
    dimensionsFor('ds-hk-hkgov-censtatd-division-statistic-new-towns', 'dhm_2'),
  ).toEqual({ 'monthly-mortgage-repayment-band': 'hkd-1-to-3-999' })
  expect(
    dimensionsFor('ds-hk-hkgov-censtatd-division-statistic-new-towns', 'dhr_2'),
  ).toEqual({ 'monthly-rent-band': 'hkd-2-000-to-5-999' })
  expect(
    dimensionsFor(
      'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
      'lbnp15_ms_nm_f',
    ),
  ).toEqual({
    'age-group': '15-and-over',
    'marital-status': 'never-married',
    sex: 'female',
  })
  expect(
    dimensionsFor(
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type',
      'QTR_PRH_HA',
    ),
  ).toEqual({
    'housing-provider': 'housing-authority',
    'housing-sector': 'public-rental',
  })

  expect(
    dimensionsFor(
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
      'whr_1',
    ),
  ).toEqual({})
  expect(
    dimensionsFor(
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
      'POPN_D',
    ),
  ).toEqual({})

  const rankedFields = registry.fields.filter(
    field => field.aggregation === 'median' || field.aggregation === 'percentile',
  )
  expect(rankedFields).not.toHaveLength(0)
  expect(
    rankedFields.every(field =>
      field.aggregation === 'median'
        ? field.aggregationPercentile === 50
        : field.aggregationPercentile === 25 || field.aggregationPercentile === 75,
    ),
  ).toBeTrue()
})

test('shows the proposed name and description before prompting for field metadata', () => {
  const output = formatCenstatdFieldReviewContext({
    field: {
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
      sourceField: 't_pop',
      unitCode: 'publisher-unknown',
      valueKind: 'numeric',
    },
    schemaCandidate: {
      localisations: [
        {
          description: 'Total population in the housing market area.',
          isTranslationVerified: true,
          locale: 'en',
          name: 'Total population',
        },
      ],
      sourceReleaseUrl: 'https://example.test/release',
    },
  })

  expect(output).toContain('proposed name')
  expect(output).toContain('Total population')
  expect(output).toContain('proposed description')
  expect(output).toContain('Total population in the housing market area.')
  expect(output).not.toContain('source field')
})

test('identifies C&SD field fields that require a reviewed decision', () => {
  const field = {
    datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
    sourceField: 'TOTAL',
    unitCode: 'publisher-unknown',
    valueKind: 'numeric',
  }
  const unresolved = resolveCenstatdFieldCuration({
    registry: emptyCenstatdFieldCuration(),
    fields: [field],
  })
  expect(unresolved.unresolved).toEqual([field])

  const resolved = resolveCenstatdFieldCuration({
    registry: {
      fields: [
        {
          datasetCode: field.datasetCode,
          localisations: [
            {
              description: 'Total publisher count.',
              isTranslationVerified: true,
              locale: 'en',
              name: 'Total',
            },
          ],
          aggregation: 'total',
          statisticKind: 'count',
          fieldName: 'totalPopulation',
          measureCode: 'population',
          dimensions: {},
          sourceField: field.sourceField,
          unitCode: 'person',
        },
      ],
    },
    fields: [field],
  })
  expect(resolved.unresolved).toEqual([])
  expect(
    resolved.metadata.get(`${field.datasetCode}\u0000${field.sourceField}`),
  ).toEqual({
    localisations: [
      {
        description: 'Total publisher count.',
        isTranslationVerified: true,
        locale: 'en',
        name: 'Total',
      },
    ],
    aggregation: 'total',
    fieldName: 'totalPopulation',
    measureCode: 'population',
    dimensions: {},
    statisticKind: 'count',
    unitCode: 'person',
  })
})

test('rejects duplicate localised field names within a C&SD dataset', () => {
  expect(() =>
    parseCenstatdFieldCuration(
      {
        datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
        fields: [
          {
            aggregation: 'none',
            localisations: [
              {
                description: 'The first distinct statistic.',
                isTranslationVerified: true,
                locale: 'en',
                name: 'A repeated field name',
              },
            ],
            fieldName: 'firstMeasure',
            measureCode: 'firstMeasure',
            dimensions: {},
            sourceField: 'first',
            statisticKind: 'count',
            unitCode: 'person',
          },
          {
            aggregation: 'none',
            localisations: [
              {
                description: 'The second distinct statistic.',
                isTranslationVerified: true,
                locale: 'en',
                name: 'A repeated field name',
              },
            ],
            fieldName: 'secondMeasure',
            measureCode: 'secondMeasure',
            dimensions: {},
            sourceField: 'second',
            statisticKind: 'count',
            unitCode: 'person',
          },
        ],
        schemaVersion: 8,
      },
      'fixture.json',
    ),
  ).toThrow('Duplicate C&SD localised field name')
})

test('requires the C&SD dataset code at the manifest root', () => {
  expect(() =>
    parseCenstatdFieldCuration(
      {
        datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
        fields: [
          {
            aggregation: 'none',
            datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
            localisations: [
              {
                description: 'A distinct statistic.',
                isTranslationVerified: true,
                locale: 'en',
                name: 'Distinct statistic',
              },
            ],
            fieldName: 'distinctStatistic',
            measureCode: 'distinctStatistic',
            dimensions: {},
            sourceField: 'distinct',
            statisticKind: 'count',
            unitCode: 'person',
          },
        ],
        schemaVersion: 8,
      },
      'fixture.json',
    ),
  ).toThrow('C&SD dataset code belongs in the manifest root')
})

test('accepts only reviewed source comparability cautions', () => {
  const manifest = {
    datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
    fields: [
      {
        aggregation: 'total',
        comparability: {
          affectedReferencePeriods: ['2011', '2016'],
          reason: 'economic-activity-status-classification-changed',
          status: 'caution',
        },
        dimensions: { 'economic-activity-status': 'home-maker' },
        fieldName: 'nonWorkingPopulationHomeMaker',
        localisations: [
          {
            description: 'Non-working population who are home-makers.',
            isTranslationVerified: true,
            locale: 'en',
            name: 'Home-makers outside the working population',
          },
        ],
        measureCode: 'nonWorkingPopulation',
        sourceField: 'nwp_hm',
        statisticKind: 'count',
        unitCode: 'person',
      },
    ],
    schemaVersion: 8,
  }

  expect(() => parseCenstatdFieldCuration(manifest, 'example.json')).not.toThrow()
  expect(() =>
    parseCenstatdFieldCuration(
      {
        ...manifest,
        fields: [
          {
            ...manifest.fields[0],
            comparability: {
              ...(manifest.fields[0]?.comparability ?? {}),
              status: 'warning',
            },
          },
        ],
      },
      'example.json',
    ),
  ).toThrow('Invalid C&SD field comparability')
  expect(() =>
    parseCenstatdFieldCuration(
      {
        ...manifest,
        fields: [
          {
            ...manifest.fields[0],
            comparability: {
              ...(manifest.fields[0]?.comparability ?? {}),
              extra: true,
            },
          },
        ],
      },
      'example.json',
    ),
  ).toThrow('Invalid C&SD field comparability')
})

test('formats every proposed localisation and canonical key for review', () => {
  const output = formatCenstatdFieldProposal({
    candidate: {
      localisations: [
        {
          description: 'Total population in the area.',
          isTranslationVerified: true,
          locale: 'en',
          name: 'Total population',
        },
        {
          description: '區內總人口。',
          isTranslationVerified: true,
          locale: 'zh-Hant',
          name: '總人口',
        },
        {
          description: '区内总人口。',
          isTranslationVerified: true,
          locale: 'zh-Hans',
          name: '总人口',
        },
      ],
      fieldName: 'totalPopulation',
    },
    sourceField: 't_pop',
    suggestedUnitCode: 'person',
  })

  expect(output).toContain('\u001B[31mt_pop')
  expect(output).toContain('totalPopulation')
  expect(output).toContain('(person)')
  expect(output).toContain('Total population')
  expect(output).toContain('總人口')
  expect(output).toContain('总人口')
})

test('suggests a compatible reviewed unit for a similarly named field', () => {
  expect(
    suggestUnitCode('totalPopulation', [
      { fieldName: 'landArea', unitCode: 'square-kilometre' },
      { fieldName: 'populationDensity', unitCode: 'person-per-square-kilometre' },
      { fieldName: 'populationMidYear', unitCode: 'person' },
    ]),
  ).toBe('person')
})

test('suggests a statistic kind separately from its unit', () => {
  expect(
    suggestStatisticKind({
      fieldName: 'sexRatio',
      unitCode: 'publisher-unknown',
    }),
  ).toBe('ratio')
  expect(
    suggestStatisticKind({
      fieldName: 'populationDensity',
      unitCode: 'person-per-square-kilometre',
    }),
  ).toBe('density')
  expect(
    suggestStatisticKind({ fieldName: 'landArea', unitCode: 'square-kilometre' }),
  ).toBe('quantity')
  expect(
    suggestStatisticKind({
      localisations: [
        {
          description: 'Sex ratio (number of males per 1 000 females).',
          isTranslationVerified: true,
          locale: 'en',
          name: 'Sex ratio (number of males per 1 000 females)',
        },
      ],
      fieldName: 'sexComparison',
      unitCode: 'publisher-unknown',
    }),
  ).toBe('ratio')
  expect(
    suggestStatisticKind({
      localisations: [
        {
          description:
            'Proportion of never-married population aged 15 and over by sex - male.',
          isTranslationVerified: true,
          locale: 'en',
          name: 'Never-married male population aged 15 and over',
        },
      ],
      fieldName: 'neverMarriedAged15AndOverBySexMale',
      unitCode: 'publisher-unknown',
    }),
  ).toBe('proportion')
})

test('suggests an aggregation stated in the proposed English semantic text', () => {
  expect(
    suggestAggregation([
      {
        description: 'Median age of residents.',
        isTranslationVerified: true,
        locale: 'en',
        name: 'Median age',
      },
    ]),
  ).toBe('median')
  expect(
    suggestAggregation([
      {
        description: 'The average household size.',
        isTranslationVerified: true,
        locale: 'en',
        name: 'Household size',
      },
    ]),
  ).toBe('mean')
  expect(
    suggestAggregation([
      {
        description: 'Age of residents.',
        isTranslationVerified: true,
        locale: 'en',
        name: 'Age',
      },
    ]),
  ).toBeNull()
})

test('infers review defaults for median and named quartile ranks', () => {
  const localisations = (name: string) => [
    {
      description: name,
      isTranslationVerified: true,
      locale: 'en' as const,
      name,
    },
  ]

  expect(suggestAggregationPercentile(localisations('Median age'))).toBe(50)
  expect(
    suggestAggregationPercentile(localisations('First quartile of household income')),
  ).toBe(25)
  expect(
    suggestAggregationPercentile(localisations('Third quartile of household income')),
  ).toBe(75)
  expect(suggestAggregation(localisations('First quartile of household income'))).toBe(
    'percentile',
  )
})

test('excludes totals from non-additive statistic kinds', () => {
  expect(validAggregationsForStatisticKind('count')).toContain('total')
  for (const statisticKind of [
    'proportion',
    'ratio',
    'rate',
    'density',
    'index',
  ] as const) {
    expect(validAggregationsForStatisticKind(statisticKind)).not.toContain('total')
  }
})

test('reuses a unique reviewed metadata decision for an age-group series', () => {
  const metadata = suggestSeriesFieldMetadata({
    decisions: [
      {
        aggregation: 'none',
        denominatorFieldName: 'totalPopulation',
        localisations: [
          {
            description: 'Percentage distribution of population aged under 15',
            isTranslationVerified: true,
            locale: 'en',
            name: 'Population aged under 15',
          },
        ],
        fieldName: 'agedUnder15',
        measureCode: 'population',
        dimensions: {},
        sourceField: 'age_1',
        statisticKind: 'proportion',
        unitCode: 'percent',
      },
    ],
    localisations: [
      {
        description: 'Percentage distribution of population aged 15-39',
        isTranslationVerified: true,
        locale: 'en',
        name: 'Population aged 15-39',
      },
    ],
  })

  expect(metadata).toEqual({
    aggregation: 'none',
    aggregationPercentile: null,
    denominatorFieldName: 'totalPopulation',
    statisticKind: 'proportion',
  })
})

test('uses Azure Chinese suggestions after an English schema proposal is edited', async () => {
  const proposals = await resolveChineseLocalisationProposals({
    candidate: {
      localisations: [
        {
          description: 'Total population',
          isTranslationVerified: true,
          locale: 'en',
          name: 'Total population',
        },
        {
          description: '總人口',
          isTranslationVerified: true,
          locale: 'zh-Hant',
          name: '總人口',
        },
        {
          description: '总人口',
          isTranslationVerified: true,
          locale: 'zh-Hans',
          name: '总人口',
        },
      ],
    },
    englishDescription: 'Population counted at the reference date',
    englishName: 'Reference population',
    translate: async (texts, options) =>
      new Map(
        [...texts].map(text => [
          text,
          `${options.to === 'zh-Hant' ? '繁' : '简'}:${text}`,
        ]),
      ),
  })

  expect(proposals.zhHant).toEqual({
    description: '繁:Population counted at the reference date',
    isTranslationVerified: false,
    locale: 'zh-Hant',
    name: '繁:Reference population',
  })
  expect(proposals.zhHans).toEqual({
    description: '简:Population counted at the reference date',
    isTranslationVerified: false,
    locale: 'zh-Hans',
    name: '简:Reference population',
  })
})

test('fills a new unit’s Chinese localisations through Azure Translator', async () => {
  const localisations = await resolveUnitLocalisations({
    description: 'Area measured in square kilometres.',
    name: 'Square kilometres',
    translate: async (texts, options) =>
      new Map(
        [...texts].map(text => [
          text,
          `${options.to === 'zh-Hant' ? '繁' : '简'}:${text}`,
        ]),
      ),
  })

  expect(localisations).toEqual([
    {
      description: 'Area measured in square kilometres.',
      locale: 'en',
      name: 'Square kilometres',
    },
    {
      description: '繁:Area measured in square kilometres.',
      locale: 'zh-Hant',
      name: '繁:Square kilometres',
    },
    {
      description: '简:Area measured in square kilometres.',
      locale: 'zh-Hans',
      name: '简:Square kilometres',
    },
  ])
})

test('parses field definitions from a CSDI simplified data specification', () => {
  const fields = parseCsdiSimplifiedDataSpecification(
    `<table>
      <tr><td>Field Name / 資料欄名稱</td><td>Data Type</td><td>Null Option</td><td>Description</td><td>描述(繁體中文)</td><td>描述(简体中文)</td></tr>
      <tr><td>t_pop</td><td>String</td><td>Null</td><td>Total population</td><td>總人口</td><td>总人口</td></tr>
      <tr><td>hma</td><td>String</td><td>Null</td><td>Housing Market Area</td><td>樓市片區</td><td>楼市片区</td></tr>
    </table>`,
  )

  expect(fields).toEqual([
    expect.objectContaining({
      dataType: 'String',
      descriptionEn: 'Total population',
      descriptionZhHans: '总人口',
      descriptionZhHant: '總人口',
      nullOption: 'Null',
      sourceField: 't_pop',
    }),
    expect.objectContaining({
      descriptionEn: 'Housing Market Area',
      sourceField: 'hma',
    }),
  ])
  expect(fields[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
})

test('keeps a CSDI field eligible when a publisher locale is absent', () => {
  const [field] = parseCsdiSimplifiedDataSpecification(
    `<table>
      <tr><td>Field Name</td><td>Data Type</td><td>Null Option</td><td>Description</td><td>描述(繁體中文)</td><td>描述(简体中文)</td></tr>
      <tr><td>value</td><td>String</td><td>Null</td><td>Value</td><td></td><td>值</td></tr>
    </table>`,
  )

  expect(field).toEqual(
    expect.objectContaining({
      descriptionEn: 'Value',
      descriptionZhHans: '值',
      descriptionZhHant: null,
    }),
  )
})

test('suggests stable camelCase names from publisher descriptions', () => {
  expect(suggestMeasureName('Land Area (sq. km)')).toBe('landArea')
  expect(suggestMeasureName("Mid-year Population ('000)")).toBe('populationMidYear')
  expect(suggestMeasureName('Population Density (Persons per sq. km)')).toBe(
    'populationDensity',
  )
})
