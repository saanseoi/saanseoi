import { expect, test } from 'bun:test'

import {
  emptyCenstatdMeasureCuration,
  formatCenstatdMeasureProposal,
  parseCsdiSimplifiedDataSpecification,
  resolveChineseLocalisationProposals,
  resolveCenstatdMeasureCuration,
  suggestMeasurementKind,
  suggestUnitCode,
  suggestMeasureName,
} from './censtatdMeasureCuration.ts'

test('identifies C&SD measure fields that require a reviewed decision', () => {
  const measure = {
    datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
    sourceField: 'TOTAL',
    unitCode: 'publisher-unknown',
    valueKind: 'numeric',
  }
  const unresolved = resolveCenstatdMeasureCuration({
    manifest: emptyCenstatdMeasureCuration(),
    measures: [measure],
  })
  expect(unresolved.unresolved).toEqual([measure])

  const resolved = resolveCenstatdMeasureCuration({
    manifest: {
      measures: [
        {
          datasetCode: measure.datasetCode,
          localisations: [
            {
              description: 'Total publisher count.',
              isTranslationVerified: true,
              locale: 'en',
              name: 'Total',
            },
          ],
          measurementKind: 'count',
          measureCode: 'totalPopulation',
          sourceField: measure.sourceField,
          unitCode: 'person',
        },
      ],
      schemaVersion: 4,
    },
    measures: [measure],
  })
  expect(resolved.unresolved).toEqual([])
  expect(
    resolved.metadata.get(`${measure.datasetCode}\u0000${measure.sourceField}`),
  ).toEqual({
    localisations: [
      {
        description: 'Total publisher count.',
        isTranslationVerified: true,
        locale: 'en',
        name: 'Total',
      },
    ],
    measurementKind: 'count',
    measureCode: 'totalPopulation',
    unitCode: 'person',
  })
})

test('formats every proposed localisation and canonical key for review', () => {
  const output = formatCenstatdMeasureProposal({
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
      measureCode: 'totalPopulation',
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

test('suggests a compatible reviewed unit for a similarly named measure', () => {
  expect(
    suggestUnitCode('totalPopulation', [
      { measureCode: 'landArea', unitCode: 'square-kilometre' },
      { measureCode: 'populationDensity', unitCode: 'person-per-square-kilometre' },
      { measureCode: 'populationMidYear', unitCode: 'person' },
    ]),
  ).toBe('person')
})

test('suggests a semantic measurement kind separately from its unit', () => {
  expect(
    suggestMeasurementKind({
      measureCode: 'sexRatio',
      unitCode: 'publisher-unknown',
    }),
  ).toBe('ratio')
  expect(
    suggestMeasurementKind({
      measureCode: 'populationDensity',
      unitCode: 'person-per-square-kilometre',
    }),
  ).toBe('rate')
  expect(
    suggestMeasurementKind({ measureCode: 'landArea', unitCode: 'square-kilometre' }),
  ).toBe('quantity')
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
