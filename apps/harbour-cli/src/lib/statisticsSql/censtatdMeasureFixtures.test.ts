import { expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { computeVersionHash } from '@repo/db'

type Localisation = {
  description: string
  isTranslationVerified: boolean
  locale: 'en' | 'zh-Hans' | 'zh-Hant'
  name: string
}

type Field = {
  aggregation: string
  comparability?: {
    affectedReferencePeriods: string[]
    reason: string
    status: string
  }
  dimensions: Record<string, string>
  fieldName: string
  localisations: Localisation[]
  measureCode: string
  statisticKind: string
  sourceField: string
  unitCode: string
}

type FieldManifest = {
  datasetCode: string
  fields: Field[]
}

type MeasureFixture = {
  datasetCode: string
  measures: Array<{ localisations: Localisation[]; measureCode: string }>
  schemaVersion: number
  versionHash: string
}

type UnitFixture = {
  units: Array<{ code: string }>
}

const fixtureDirectory = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/hkgov-censtatd-statistics',
)
const measureFixtureDirectory = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/curations/hkgov-censtatd-statistics-measures',
)
const unitFixturePath = resolve(
  import.meta.dir,
  '../../../../../fixtures/meta/units/standard.json',
)

async function readFieldManifests() {
  const paths = (await readdir(fixtureDirectory))
    .filter(path => path.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right))
  return Promise.all(
    paths.map(
      async path =>
        JSON.parse(
          await readFile(resolve(fixtureDirectory, path), 'utf8'),
        ) as FieldManifest,
    ),
  )
}

async function readMeasureFixtures() {
  const paths = (await readdir(measureFixtureDirectory))
    .filter(path => path.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right))
  return Promise.all(
    paths.map(
      async path =>
        JSON.parse(
          await readFile(resolve(measureFixtureDirectory, path), 'utf8'),
        ) as MeasureFixture,
    ),
  )
}

async function readUnitCodes() {
  const fixture = JSON.parse(await readFile(unitFixturePath, 'utf8')) as UnitFixture
  return new Set(fixture.units.map(unit => unit.code))
}

test('defines one dimension-free localised measure for every curated C&SD field mapping', async () => {
  const [fixtures, fieldManifests] = await Promise.all([
    readMeasureFixtures(),
    readFieldManifests(),
  ])

  expect(fixtures.every(fixture => fixture.schemaVersion === 1)).toBe(true)
  expect(
    fixtures.every(
      fixture =>
        Object.keys(fixture).sort().join(',') ===
        'datasetCode,measures,schemaVersion,versionHash',
    ),
  ).toBe(true)
  expect(
    fixtures.every(fixture => /^sha256:[a-f0-9]{64}$/.test(fixture.versionHash)),
  ).toBe(true)
  expect(
    fixtures.every(
      ({ datasetCode, measures, schemaVersion, versionHash }) =>
        versionHash === computeVersionHash({ datasetCode, measures, schemaVersion }),
    ),
  ).toBe(true)
  expect(fixtures.map(fixture => fixture.datasetCode)).toEqual(
    fieldManifests.map(dataset => dataset.datasetCode),
  )

  for (const source of fieldManifests) {
    const dataset = fixtures.find(
      candidate => candidate.datasetCode === source.datasetCode,
    )
    expect(dataset).toBeDefined()
    if (!dataset) continue

    const measureCodes = new Set(dataset.measures.map(measure => measure.measureCode))
    expect(source.fields.every(field => measureCodes.has(field.measureCode))).toBe(true)
    expect(
      dataset.measures.every(
        measure =>
          Object.keys(measure).sort().join(',') === 'localisations,measureCode',
      ),
    ).toBe(true)
    expect(
      dataset.measures.every(measure =>
        ['en', 'zh-Hant', 'zh-Hans'].every(locale =>
          measure.localisations.some(localisation => localisation.locale === locale),
        ),
      ),
    ).toBe(true)
  }
})

test('uses reviewed registered units for C&SD statistic values', async () => {
  const [fieldManifests, unitCodes] = await Promise.all([
    readFieldManifests(),
    readUnitCodes(),
  ])
  const fields = fieldManifests.flatMap(manifest => manifest.fields)

  expect(fields.every(field => field.unitCode !== 'publisher-unknown')).toBe(true)
  expect(fields.every(field => unitCodes.has(field.unitCode))).toBe(true)
  expect(
    fields.every(field =>
      Object.values(field.dimensions).every(value => !value.includes('hk-dollar')),
    ),
  ).toBe(true)
  expect(
    fields.every(field =>
      Object.values(field.dimensions).every(
        value => !/^hkd-(?:\d+|\d{1,2}-\d{3})-(?:\d+|\d{1,2}-\d{3})$/.test(value),
      ),
    ),
  ).toBe(true)

  const expectedUnits = [
    ['totalPopulation', 'count', 'person'],
    ['labourForce', 'quantity', 'person'],
    ['labourForceParticipationRate', 'rate', 'percent'],
    ['domesticHouseholds', 'count', 'household'],
    ['landBasedNonInstitutionalPopulation', 'count', 'person'],
    ['overallDependencyRatio', 'ratio', 'percent'],
    ['workingPopulation', 'count', 'person'],
    ['occupiedQuarters', undefined, 'living-quarter'],
    ['permanentLivingQuarters', 'count', 'living-quarter'],
    ['subdividedUnits', 'count', 'subdivided-unit'],
  ] as const

  for (const [measureCode, statisticKind, unitCode] of expectedUnits) {
    const matching = fields.filter(
      field =>
        field.measureCode === measureCode &&
        (statisticKind === undefined || field.statisticKind === statisticKind),
    )
    expect(matching.length).toBeGreaterThan(0)
    expect(matching.every(field => field.unitCode === unitCode)).toBe(true)
  }

  expect(fields.some(field => field.sourceField === 'gml_id')).toBe(false)
  expect(fields.find(field => field.sourceField === 'lbnp_odr_xfdh')).toEqual(
    expect.objectContaining({
      measureCode: 'overallDependencyRatio',
      unitCode: 'percent',
    }),
  )
})

test('keeps derived median values on their canonical measures and units', async () => {
  const fields = (await readFieldManifests()).flatMap(manifest => manifest.fields)
  const medianAgeSourceFields = new Set([
    'lbnp_ma_t',
    'lbnp_ma_m',
    'lbnp_ma_f',
    'lbnp_ma_t_xfdh',
    'lbnp_ma_m_xfdh',
    'lbnp_ma_f_xfdh',
    'lf_ma_t',
    'lf_ma_m',
    'lf_ma_f',
    'lf_ma_t_xfdh',
    'lf_ma_m_xfdh',
    'lf_ma_f_xfdh',
  ])
  const medianEmploymentIncomeSourceFields = new Set([
    't_mmearn',
    'mmearn_m',
    'mmearn_f',
    't_mmearn_xfdh',
    'mmearn_xfdh_m',
    'mmearn_xfdh_f',
  ])

  expect(
    fields
      .filter(field => medianAgeSourceFields.has(field.sourceField))
      .every(
        field =>
          field.measureCode === 'medianAge' &&
          field.statisticKind === 'quantity' &&
          field.aggregation === 'median' &&
          field.unitCode === 'year',
      ),
  ).toBe(true)
  expect(
    fields
      .filter(field => medianEmploymentIncomeSourceFields.has(field.sourceField))
      .every(
        field =>
          field.measureCode === 'medianMonthlyEmploymentIncome' &&
          field.statisticKind === 'quantity' &&
          field.aggregation === 'median' &&
          field.unitCode === 'hong-kong-dollar',
      ),
  ).toBe(true)
})

test('keeps subdivided-unit quarters and units distinct', async () => {
  const fields = (await readFieldManifests()).flatMap(manifest => manifest.fields)

  expect(fields.find(field => field.sourceField === 'sdu_oq')).toEqual(
    expect.objectContaining({
      dimensions: {
        'occupancy-status': 'occupied',
        'subdivision-status': 'contains-subdivided-units',
      },
      fieldName: 'occupiedQuartersWithSubdividedUnits',
      measureCode: 'occupiedQuarters',
      statisticKind: 'count',
      unitCode: 'living-quarter',
    }),
  )
  expect(fields.find(field => field.sourceField === 'sdu_n')).toEqual(
    expect.objectContaining({
      dimensions: { 'occupancy-status': 'occupied' },
      fieldName: 'occupiedSubdividedUnits',
      measureCode: 'subdividedUnits',
      statisticKind: 'count',
      unitCode: 'subdivided-unit',
    }),
  )
})

test('encodes every exclusion stated in the English field description', async () => {
  const fields = (await readFieldManifests()).flatMap(manifest => manifest.fields)

  for (const field of fields) {
    const description = field.localisations
      .find(localisation => localisation.locale === 'en')
      ?.description.toLowerCase()
    if (!description) continue
    if (
      /exclu(?:ding|des).*foreign domestic helper/.test(description) &&
      /exclu(?:ding|des).*unpaid family worker/.test(description)
    ) {
      expect(field.dimensions['foreign-domestic-helper']).toBe('excluded')
      expect(field.dimensions['unpaid-family-worker']).toBe('excluded')
    }
  }
})

test('keeps canonical measure localisations identical across datasets', async () => {
  const fixtures = await readMeasureFixtures()
  const localisationsByMeasure = new Map<string, Set<string>>()
  for (const fixture of fixtures) {
    for (const measure of fixture.measures) {
      const variants = localisationsByMeasure.get(measure.measureCode) ?? new Set()
      variants.add(JSON.stringify(measure.localisations))
      localisationsByMeasure.set(measure.measureCode, variants)
    }
  }

  expect(
    [...localisationsByMeasure.values()].every(variants => variants.size === 1),
  ).toBe(true)
})

test('normalises localisations for equivalent C&SD source fields', async () => {
  const manifests = await readFieldManifests()
  const field = (datasetCode: string, sourceField: string) =>
    manifests
      .find(manifest => manifest.datasetCode === datasetCode)
      ?.fields.find(candidate => candidate.sourceField === sourceField)
  const newTowns = 'ds-hk-hkgov-censtatd-division-statistic-new-towns'
  const populationHouseholds =
    'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
  const majorHousingEstates =
    'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates'

  const equivalentFields: Array<[string, string, string, string]> = [
    [newTowns, 'lfpr_t', populationHouseholds, 't_lfpr'],
    [newTowns, 'lfpr_m', populationHouseholds, 'lfpr_m'],
    [newTowns, 'lfpr_f', populationHouseholds, 'lfpr_f'],
    [newTowns, 'ma_hh', populationHouseholds, 'ma_hh'],
    [newTowns, 'ma_hh', majorHousingEstates, 'ma_hh'],
    [newTowns, 'ma_econhh', populationHouseholds, 'ma_econhh'],
    [newTowns, 'ma_econhh', majorHousingEstates, 'ma_econhh'],
  ]

  for (const [
    leftDataset,
    leftSourceField,
    rightDataset,
    rightSourceField,
  ] of equivalentFields) {
    const left = field(leftDataset, leftSourceField)
    const right = field(rightDataset, rightSourceField)
    expect(left).toBeDefined()
    expect(right).toBeDefined()
    expect(left?.localisations).toEqual(right?.localisations)
  }
})

test('keeps reviewed names readable and range identifiers explicit', async () => {
  const manifests = await readFieldManifests()
  const fields = manifests.flatMap(manifest => manifest.fields)

  expect(
    fields.every(
      field =>
        !/Aged\d{3,}|Hkd(?:60009999|1000019999|2000029999|3000039999|4000059999|2000039999|20005999)|HK\d|percentageShare|EconomicallyActiveExcluded/.test(
          field.fieldName,
        ),
    ),
  ).toBe(true)
  expect(
    fields.every(field =>
      field.localisations.every(localisation => {
        const balance = [...localisation.name].reduce(
          (value, character) =>
            value + (character === '(' ? 1 : character === ')' ? -1 : 0),
          0,
        )
        return (
          balance === 0 &&
          !localisation.name.includes('&#') &&
          !/^[a-z]/.test(localisation.name) &&
          !/\d:\s+\d/.test(localisation.name)
        )
      }),
    ),
  ).toBe(true)

  for (const manifest of manifests) {
    for (const locale of ['en', 'zh-Hant', 'zh-Hans'] as const) {
      const names = manifest.fields.map(
        field =>
          field.localisations.find(localisation => localisation.locale === locale)
            ?.name,
      )
      expect(new Set(names).size).toBe(names.length)
    }
  }

  expect(
    fields
      .filter(field => field.sourceField === 'nwp_care')
      .every(
        field =>
          field.localisations.find(localisation => localisation.locale === 'en')
            ?.name === 'Non-working population: Unpaid carers',
      ),
  ).toBe(true)
})

test('keeps C&SD field names and dimensions canonical', async () => {
  const fields = (await readFieldManifests()).flatMap(manifest =>
    manifest.fields.map(field => ({ ...field, datasetCode: manifest.datasetCode })),
  )

  expect(fields.every(field => field.fieldName.length <= 80)).toBe(true)
  expect(fields.every(field => !/Hk(?!d)/.test(field.fieldName))).toBe(true)
  expect(
    fields.every(field =>
      Object.values(field.dimensions).every(value => value !== 'under-15'),
    ),
  ).toBe(true)
  expect(
    fields.every(
      field =>
        !['home-makers', 'others'].includes(
          field.dimensions['economic-activity-status'] ?? '',
        ),
    ),
  ).toBe(true)
  expect(
    fields.every(
      field =>
        field.dimensions['monthly-mortgage-repayment-band'] !==
        'by-non-household-members-only',
    ),
  ).toBe(true)
  expect(
    fields
      .filter(field => field.sourceField.startsWith('nwp_'))
      .every(field => field.measureCode === 'nonWorkingPopulation'),
  ).toBe(true)
  expect(
    fields
      .filter(
        field =>
          field.measureCode === 'totalPopulation' &&
          field.statisticKind === 'proportion',
      )
      .every(field => field.unitCode === 'percent'),
  ).toBe(true)
  expect(
    fields
      .filter(field => field.comparability)
      .map(field => ({
        datasetCode: field.datasetCode,
        sourceField: field.sourceField,
        comparability: field.comparability,
      })),
  ).toEqual(
    ['major-housing-estates-2021.json', 'new-towns-2021.json'].flatMap(filename =>
      ['nwp_hm', 'nwp_re', 'nwp_care', 'nwp_oth'].map(sourceField => ({
        datasetCode:
          filename === 'major-housing-estates-2021.json'
            ? 'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates'
            : 'ds-hk-hkgov-censtatd-division-statistic-new-towns',
        sourceField,
        comparability: {
          affectedReferencePeriods: ['2011', '2016'],
          reason: 'economic-activity-status-classification-changed',
          status: 'caution',
        },
      })),
    ),
  )
})

test('maps C&SD study-location fields to one full-time-students measure', async () => {
  const [fixtures, fieldManifests] = await Promise.all([
    readMeasureFixtures(),
    readFieldManifests(),
  ])
  const mappings = fieldManifests.flatMap(dataset => dataset.fields)
  const studyLocationSourceFields = [
    'pls_same',
    'pls_diff_hk',
    'pls_diff_kln',
    'pls_diff_nt',
    's_diff_oth',
  ]

  expect(
    mappings
      .filter(mapping => studyLocationSourceFields.includes(mapping.sourceField))
      .map(mapping => mapping.measureCode),
  ).toEqual(Array(10).fill('fullTimeStudentsInHongKong'))

  for (const dataset of fixtures) {
    const measure = dataset.measures.find(
      candidate => candidate.measureCode === 'fullTimeStudentsInHongKong',
    )
    if (!measure) continue
    expect(measure.localisations).toEqual([
      {
        description:
          'Number of persons studying full-time courses in educational institutions in Hong Kong.',
        isTranslationVerified: false,
        locale: 'en',
        name: 'Persons studying full-time courses in educational institutions in Hong Kong',
      },
      {
        description: '於香港院校就讀全日制課程的人口',
        isTranslationVerified: false,
        locale: 'zh-Hant',
        name: '於香港院校就讀全日制課程的人口',
      },
      {
        description: '于香港院校就读全日制课程的人口',
        isTranslationVerified: false,
        locale: 'zh-Hans',
        name: '于香港院校就读全日制课程的人口',
      },
    ])
  }
})

test('maps sex-qualified median-age fields to the shared median-age measure', async () => {
  const fixtures = await readFieldManifests()

  for (const fixture of fixtures) {
    const medianAgeFields = fixture.fields.filter(mapping =>
      ['t_ma', 'ma_m', 'ma_f'].includes(mapping.sourceField),
    )
    if (medianAgeFields.length === 0) continue
    expect(medianAgeFields).toEqual([
      expect.objectContaining({
        fieldName: 'medianAge',
        measureCode: 'medianAge',
        sourceField: 't_ma',
      }),
      expect.objectContaining({
        fieldName: 'medianAgeMale',
        measureCode: 'medianAge',
        sourceField: 'ma_m',
      }),
      expect.objectContaining({
        fieldName: 'medianAgeFemale',
        measureCode: 'medianAge',
        sourceField: 'ma_f',
      }),
    ])
  }
})

test('keeps age groups on fields and maps them to total population', async () => {
  const [fixtures, fieldManifests] = await Promise.all([
    readMeasureFixtures(),
    readFieldManifests(),
  ])
  const datasetCode =
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  const field = fieldManifests
    .find(candidate => candidate.datasetCode === datasetCode)
    ?.fields.find(candidate => candidate.sourceField === 'age_2')

  expect(field).toEqual(
    expect.objectContaining({
      dimensions: { 'age-group': '15-to-39', sex: 'all' },
      fieldName: 'aged15To39',
      measureCode: 'totalPopulation',
      sourceField: 'age_2',
    }),
  )
  expect(
    fixtures
      .find(candidate => candidate.datasetCode === datasetCode)
      ?.measures.some(measure => measure.measureCode === 'aged15To39'),
  ).toBe(false)
})
