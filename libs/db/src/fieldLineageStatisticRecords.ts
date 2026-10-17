import valueConversion from '../../../fixtures/meta/fieldLineage/operations.json'
const normaliser =
  'apps/harbour-cli/src/lib/pipeline/statistics/normaliseHkgovCenstatdStatistics.ts'
type Specification = {
  inputs: string[]
  implementation: { path: string; symbol: string }
  expression: string
  steps?: string[]
  guards?: string[]
  valueConversion?: unknown
  additionalImplementations?: Array<{ path: string; symbol: string }>
}

/** Intermediate collections are produced once; record outputs select the same packed record. */
export function statisticRecordSpecification(path: string): Specification | null {
  const make = (
    inputs: string[],
    expression: string,
    steps: string[] = [],
  ): Specification => ({
    inputs,
    expression,
    steps,
    ...(path === 'recordObservations'
      ? { valueConversion: valueConversion.operations['censtatd-statistic-value'] }
      : {}),
    implementation: { path: normaliser, symbol: 'normaliseStatistics' },
  })
  if (path === 'geography')
    return make(
      [
        'properties',
        'sourceFeatureRef',
        'sourceVersion',
        'datasetCode',
        'geographyOverride',
        'areaCompanionByReferencePeriod',
        'referencePeriodCode',
      ],
      'withAreaCompanion(geographyOverride ?? geographyFor(profileFor(datasetCode, properties, sourceVersion).dimensions, sourceFeatureRef.replace("hkgov-censtatd/" + datasetCode + "/" + sourceVersion + "/", "")), areaCompanionByReferencePeriod, parseStatisticsReferencePeriod(referencePeriodCode).endYear)',
      [
        'Prefer the building-group dimension, otherwise the first dimension; absent dimensions use publisher-feature and the stripped source reference.',
        'Use the matching kind-class dimension for class; a building-group with a housing-market-area parent gets namespace housing-market-area:<parent code>.',
        'A supplied reviewed geography replaces the inferred geography. Select the area companion by exact reference-period end year, then *, otherwise preserve geography.',
        'Substitute every {referencePeriodEndYear} placeholder in companion cohortKey, domainCode and variant. Reject invalid variant, cohort or domain tokens.',
      ],
    )
  if (path === 'seriesRows')
    return make(
      [
        'datasetCode',
        'sourceReleaseId',
        'sourceFeatureRef',
        'referencePeriodCode',
        'geography',
        'statisticDivisionId',
      ],
      'For every input row, set series[seriesId] to its datasetCode, divisionId ?? null, geography, reference-period fields, sourceFeatureRef and sourceReleaseId.',
      [
        'seriesId = "stats-series:" + SHA256(JSON.stringify({datasetCode,referencePeriodCode,sourceFeatureRef})).',
        'Map.set replaces repeated series identities; observations for the identity are appended separately, not discarded.',
        'Reference-period start, end, endYear and granularity come from parseStatisticsReferencePeriod.',
      ],
    )
  if (path === 'recordObservations')
    return make(
      [
        'properties',
        'sourceField',
        'datasetCode',
        'sourceFeatureRef',
        'referencePeriodCode',
        'fieldMetadata',
      ],
      'Append accepted observations to observationsBySeries[seriesIdentifier({datasetCode,referencePeriodCode,sourceFeatureRef})] in input/property order.',
      [
        'Use profileFor identifier exclusions and literal conversion; omit null literals. fieldName = reviewed metadata fieldName ?? sourceField.',
        'A signed decimal literal is numeric; MYPOPN_LAND is scaled by the retained population-thousands rule. ** is suppressed; -, N.A. and NA are unavailable; other literals are categorical.',
        'Retain fieldName, sourceField, numericValue, valueCode and sourceValue separately. Population precision uses the maximum decimal places for each sourceField/fieldName across observations.',
      ],
    )
  if (path === 'packedRecord')
    return {
      ...make(
        [
          'seriesRows',
          'recordObservations',
          'fields',
          'fieldsI18n',
          'measures',
          'measuresI18n',
        ],
        'Pack series and observations into records keyed by recordIdentifier; select the record matching the requested canonical record ID.',
        [
          'Version fields and measures with versionStatisticsDefinitions before packing.',
          'Sort series by sourceFeatureRef.localeCompare. recordIdentifier derives an ss-prefixed UUIDv5 from JSON.stringify({datasetCode,referencePeriodCode,geography:{kind,code,class:class??null,namespace:namespace??null}}) using canonicalStatisticId.',
          'On the first series for a record identity, copy that series metadata except sourceFeatureRef and initialise values, a temporary per-field source map and fieldDefinitionHashes as empty objects. Later series preserve the first series sourceReleaseId.',
          'Reject different divisionId or hashStatisticContent(geography) for an existing record identity, including differences outside the identity fields such as areaCompanion.',
          'For each series observation, reject duplicate fieldName within the record. Set values[fieldName] = numericValue ?? valueCode ?? sourceValue.',
          'Collect each field’s contributing sourceFeatureRef/sourceReleaseId, then compact fieldSources into property-scoped entries: an empty property supplies the default and /values/{field} overrides it. Require and retain the version hash at datasetCode + U+0000 + fieldName.',
          'Only retain records with at least one value. Missing requested record means omitted output, never an invented empty record.',
        ],
      ),
      additionalImplementations: [
        {
          path: 'apps/harbour-cli/src/lib/pipeline/statistics/statisticsRecordIdentity.ts',
          symbol: 'versionStatisticsDefinitions',
        },
      ],
    }
  if (['values', 'fieldDefinitionHashes', 'fieldSources'].includes(path))
    return make(['packedRecord'], `packedRecord.${path}`)
  return null
}
