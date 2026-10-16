import { compactStatisticFieldSources } from '@repo/db'
import { expect, test } from 'bun:test'
import operations from '../../../../../../fixtures/meta/fieldLineage/operations.json'
import { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics'
import { statisticProfileSpecification } from '../../../../../../libs/db/src/fieldLineageStatisticProfile'
import { statisticDefinitionFoldSpecification } from '../../../../../../libs/db/src/fieldLineageStatisticDefinitions'
import { hashStatisticContent } from './statisticsRecordIdentity'
import { statisticRecordSpecification } from '../../../../../../libs/db/src/fieldLineageStatisticRecords'
import intakeProfiles from '../../../../../../fixtures/meta/fieldLineage/censtatd-intake-profiles.json'
import { CENSTATD_STATISTIC_PROFILES } from '../../sources/hkgov/censtatd/hkgovCenstatdStatistics'

test('Statistics value specification matches decimal, suppression and literal processing', () => {
  const spec = operations.operations['censtatd-statistic-value']
  expect(spec.branches[0]!.factor).toBe(1000)
  for (const [value, expected] of [
    ['1.2345', '1234.5'],
    ['-0.0001', '-0.1'],
    ['**', 'suppressed'],
    ['NA', 'unavailable'],
    ['N.A.', 'unavailable'],
    ['-', 'unavailable'],
    ['provisional', 'provisional'],
  ] as const) {
    const result = normaliseHkgovCenstatdStatistics([
      {
        datasetCode: 'ds-hk-hkgov-censtatd-land-area-population-density-district',
        sourceReleaseId: 'release',
        sourceFeatureRef: 'feature',
        sourceVersion: '2024',
        properties: {
          DC: '11',
          DC_CHI: '中西區',
          DC_ENG: 'Central and Western',
          PERIOD: '2024',
          MYPOPN_LAND: value,
        },
      },
    ])
    expect(Object.values(result.records[0]!.values)).toEqual([expected])
  }
})

test('retained Statistics profiles agree with period selection and identifier exclusion for every current dataset', () => {
  const cases: Array<[string, Record<string, unknown>, string, string]> = [
    [
      'housing-market-areas-building-groups',
      {
        hma: 'H',
        hma_eng: 'Market',
        hma_chi: '區',
        bg: 'B',
        bg_eng: 'Building',
        bg_chi: '樓',
        bg_ind: '1',
      },
      '2021',
      'building-group',
    ],
    [
      'major-housing-estates',
      { estate: 'E', estate_eng: 'Estate', estate_chi: '邨', gml_id: 'id' },
      '2021',
      'housing-estate',
    ],
    [
      'new-towns',
      { newtown: 'T', newtown_eng: 'Town', newtown_chi: '鎮', gml_id: 'id' },
      '2021',
      'new-town',
    ],
    [
      'permanent-living-quarters',
      { AREA_ENG: 'Hong Kong', AREA_CHI: '香港', PERIOD: '2024' },
      '2024',
      'area',
    ],
    [
      'permanent-living-quarters-district',
      { DC: '11', DC_ENG: 'Central', DC_CHI: '中西區', YEAR: 2024, QUARTER: 'q2' },
      '2024-Q2',
      'district',
    ],
    [
      'population-households-district',
      { dc: '11', dc_eng: 'Central', dc_chi: '中西區', dc_class: 'DC', year: '2023' },
      '2023',
      'district',
    ],
    [
      'subdivided-units-district',
      { dc: '11', dc_eng: 'Central', dc_chi: '中西區', dc_class: 'DC' },
      '2021',
      'district',
    ],
    [
      'land-area-population-density-district',
      { DC: '11', DC_ENG: 'Central', DC_CHI: '中西區', PERIOD: '2024' },
      '2024',
      'district',
    ],
  ]
  for (const [suffix, identifiers, period, kind] of cases) {
    const datasetCode = `ds-hk-hkgov-censtatd-${suffix}`
    const specification = statisticProfileSpecification(datasetCode)!
    expect(new Set(specification.identifierFields)).toEqual(
      new Set(Object.keys(identifiers)),
    )
    const result = normaliseHkgovCenstatdStatistics([
      {
        datasetCode,
        sourceReleaseId: 'release',
        sourceVersion: '2021',
        sourceFeatureRef: `hkgov-censtatd/${datasetCode}/2021/feature`,
        properties: { ...identifiers, amount: ' 12 ', omitted: null },
      },
    ])
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      referencePeriodCode: period,
      geography: { kind },
      values: { amount: '12' },
    })
    expect(result.fields.map(field => field.sourceField)).toEqual(['amount'])
    if (kind === 'building-group')
      expect(result.records[0]!.geography).toMatchObject({
        code: 'B',
        class: '1',
        namespace: 'housing-market-area:H',
      })
  }
})

test('Statistics definition fold retains numeric classification across rows and hashes the field and linked measure', () => {
  const datasetCode = 'ds-hk-hkgov-censtatd-land-area-population-density-district'
  const input = ['literal', '12', '**'].map((amount, index) => ({
    datasetCode,
    sourceReleaseId: 'release',
    sourceVersion: '2024',
    sourceFeatureRef: `feature-${index}`,
    properties: {
      DC: String(index),
      DC_ENG: `District ${index}`,
      PERIOD: '2024',
      amount,
    },
  }))
  const forward = normaliseHkgovCenstatdStatistics(input)
  const reverse = normaliseHkgovCenstatdStatistics(input.toReversed())
  expect(forward.fields).toHaveLength(1)
  expect(forward.fields[0]!.valueKind).toBe('numeric')
  expect(reverse.fields[0]!.versionHash).toBe(forward.fields[0]!.versionHash)
  const { versionHash, measureVersionHash, ...field } = forward.fields[0]!
  const localisations = forward.fieldsI18n.map(({ versionHash: _hash, ...row }) => row)
  expect(versionHash).toBe(
    hashStatisticContent({ field, localisations, measureVersionHash }),
  )
  expect(measureVersionHash).toBe(forward.measures[0]!.versionHash)
  expect(statisticDefinitionFoldSpecification().fieldExpression.valueKind).toContain(
    'existingField?.valueKind === "numeric"',
  )
  expect(statisticDefinitionFoldSpecification().outputs).toEqual([
    'fields',
    'fieldsI18n',
    'measures',
    'measuresI18n',
  ])
})

test('packed Statistics keep first-series identity and per-field source identity independently', () => {
  const datasetCode = 'ds-hk-hkgov-censtatd-population-households-district'
  const row = (
    sourceFeatureRef: string,
    values: Record<string, unknown>,
    divisionId = 'division',
  ) => ({
    datasetCode,
    sourceReleaseId: `${sourceFeatureRef}-release`,
    sourceFeatureRef,
    sourceVersion: '2024',
    divisionId,
    properties: { dc: '11', dc_class: 'A', year: '2024', ...values },
  })
  const inputs = [row('z', { households: '20' }), row('a', { population: '100' })]
  const result = normaliseHkgovCenstatdStatistics(inputs)
  expect(result.records).toHaveLength(1)
  expect(result.records[0]).toMatchObject({
    sourceFeatureRef: 'a',
    sourceReleaseId: 'a-release',
    values: { population: '100', households: '20' },
    fieldSources: compactStatisticFieldSources({
      population: { sourceFeatureRef: 'a', sourceReleaseId: 'a-release' },
      households: { sourceFeatureRef: 'z', sourceReleaseId: 'z-release' },
    }),
  })
  expect(normaliseHkgovCenstatdStatistics(inputs.toReversed()).records).toEqual(
    result.records,
  )
  expect(() =>
    normaliseHkgovCenstatdStatistics([
      row('a', { population: '100' }),
      row('z', { population: '100' }),
    ]),
  ).toThrow('duplicate field')
  expect(() =>
    normaliseHkgovCenstatdStatistics([
      row('a', { population: '100' }),
      row('z', { households: '20' }, 'another-division'),
    ]),
  ).toThrow('conflicting geography')
  expect(normaliseHkgovCenstatdStatistics([row('a', {})]).records).toEqual([])
  expect(statisticRecordSpecification('packedRecord')?.inputs).toContain(
    'recordObservations',
  )
})

test('retained intake profiles cover the current parser branches exactly', () => {
  expect(intakeProfiles).toEqual(CENSTATD_STATISTIC_PROFILES)
})

test('reviewed geography takes precedence and exact-year companions take precedence over wildcard companions', () => {
  const result = normaliseHkgovCenstatdStatistics([
    {
      datasetCode: 'ds-hk-hkgov-censtatd-population-households-district',
      sourceReleaseId: 'release',
      sourceFeatureRef: 'feature',
      sourceVersion: '2024',
      properties: { dc: '11', year: '2024', amount: '1' },
      geography: { code: 'CW', kind: 'district' },
      areaCompanionByReferencePeriod: {
        '*': { cohortKey: '2000', domainCode: 'geographic', variant: 'fallback' },
        '2024': {
          cohortKey: '{referencePeriodEndYear}',
          domainCode: 'geographic',
          variant: 'hkgov-censtatd',
        },
      },
    },
  ])
  expect(result.records[0]!.geography).toEqual({
    code: 'CW',
    kind: 'district',
    areaCompanion: {
      cohortKey: '2024',
      domainCode: 'geographic',
      variant: 'hkgov-censtatd',
    },
  })
})
