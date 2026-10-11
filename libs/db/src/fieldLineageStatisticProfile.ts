/** Dataset branches in normaliseHkgovCenstatdStatistics.profileFor. */
const prefix = 'ds-hk-hkgov-censtatd-division-statistic-'
export function statisticProfileSpecification(datasetCode: string) {
  const profiles: Record<
    string,
    { dimensions: string[][]; period: Record<string, unknown>; identifiers?: string[] }
  > = {
    'housing-market-areas-building-groups': {
      dimensions: [
        ['housing-market-area', 'hma', 'hma_eng', 'hma_chi'],
        ['building-group', 'bg', 'bg_eng', 'bg_chi'],
        ['building-group-class', 'bg_ind'],
      ],
      period: { kind: 'source-version' },
    },
    'major-housing-estates': {
      dimensions: [['housing-estate', 'estate', 'estate_eng', 'estate_chi']],
      period: { kind: 'source-version' },
      identifiers: ['gml_id'],
    },
    'new-towns': {
      dimensions: [['new-town', 'newtown', 'newtown_eng', 'newtown_chi']],
      period: { kind: 'source-version' },
      identifiers: ['gml_id'],
    },
    'permanent-living-quarters': {
      dimensions: [['area', 'AREA_ENG', 'AREA_ENG', 'AREA_CHI']],
      period: { kind: 'property', field: 'PERIOD' },
      identifiers: ['PERIOD'],
    },
    'permanent-living-quarters-district': {
      dimensions: [['district', 'DC', 'DC_ENG', 'DC_CHI']],
      period: { kind: 'quarter', year: 'YEAR', quarter: 'QUARTER' },
      identifiers: ['YEAR', 'QUARTER'],
    },
    'population-households-district': {
      dimensions: [
        ['district', 'dc', 'dc_eng', 'dc_chi'],
        ['district-class', 'dc_class'],
      ],
      period: { kind: 'property', field: 'year' },
      identifiers: ['year'],
    },
    'subdivided-units-district': {
      dimensions: [
        ['district', 'dc', 'dc_eng', 'dc_chi'],
        ['district-class', 'dc_class'],
      ],
      period: { kind: 'source-version' },
    },
    'land-area-population-density-district': {
      dimensions: [['district', 'DC', 'DC_ENG', 'DC_CHI']],
      period: { kind: 'property', field: 'PERIOD' },
      identifiers: ['PERIOD'],
    },
  }
  const profile = profiles[datasetCode.slice(prefix.length)]
  if (!datasetCode.startsWith(prefix) || !profile) return null
  return {
    ...profile,
    literal:
      'Trim strings and return null for an empty result; finite numbers become String(value); all other values become null.',
    identifierFields: [
      ...new Set([
        ...profile.dimensions.flatMap(dimension => dimension.slice(1)),
        ...(profile.identifiers ?? []),
      ]),
    ],
    identifierConditions:
      datasetCode === `${prefix}housing-market-areas-building-groups`
        ? { bg: ['bg', 'bg_eng', 'bg_chi'], bg_ind: ['bg_ind'] }
        : {},
    periodExpression:
      profile.period.kind === 'source-version'
        ? 'sourceVersion'
        : profile.period.kind === 'quarter'
          ? "requireLiteral(properties.YEAR) + '-Q' + requireLiteral(properties.QUARTER).replace(/^Q/i, '')"
          : `requireLiteral(properties[${JSON.stringify(profile.period.field)}])`,
    geography:
      'Build non-empty dimensions in declaration order. Choose building-group before the first dimension; use the matching kind-class dimension for class and housing-market-area parent for namespace. Without a dimension, use the stripped source feature reference and kind publisher-feature. An explicitly supplied reviewed geography takes precedence.',
    implementation: {
      path: 'apps/harbour-cli/src/lib/pipeline/statistics/normaliseHkgovCenstatdStatistics.ts',
      symbol: 'profileFor',
    },
    additionalImplementations: [
      {
        path: 'libs/core/src/pipeline/services/statistics/statisticsReferencePeriod.ts',
        symbol: 'parseStatisticsReferencePeriod',
      },
    ],
  }
}
