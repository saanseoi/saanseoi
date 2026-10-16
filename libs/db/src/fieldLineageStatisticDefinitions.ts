/** Definition construction is a fold over accepted observations, before record packing. */
export function statisticDefinitionFoldSpecification() {
  return {
    implementation: {
      path: 'apps/harbour-cli/src/lib/pipeline/statistics/normaliseHkgovCenstatdStatistics.ts',
      symbol: 'normaliseStatistics',
    },
    additionalImplementations: [
      {
        path: 'apps/harbour-cli/src/lib/pipeline/statistics/statisticFieldCurationRule.ts',
        symbol: 'statisticFieldCurationRule',
      },
      {
        path: 'apps/harbour-cli/src/lib/pipeline/statistics/statisticLocalisationRule.ts',
        symbol: 'statisticLocalisationRule',
      },
      {
        path: 'apps/harbour-cli/src/lib/pipeline/statistics/normaliseHkgovCenstatdStatistics.ts',
        symbol: 'parseObservationValue',
      },
    ],
    iteration:
      'Traverse publisher features in input order and Object.entries(properties) in property order. Apply profileFor identifier exclusions, literal conversion and reference-period validation. Skip excluded keys and null literals.',
    keys: {
      field: ['datasetCode', 'fieldName'],
      fieldLocalisation: ['datasetCode', 'fieldName', 'locale'],
      measure: ['datasetCode', 'measureCode'],
      measureLocalisation: ['datasetCode', 'measureCode', 'locale'],
      encoding: 'Join key components with U+0000.',
    },
    steps: [
      'For each accepted publisher field, parseObservationValue(sourceField, sourceValue), then select metadata by datasetCode + U+0000 + sourceField.',
      'Resolve fieldName = metadata.fieldName ?? sourceField, measureCode = metadata.measureCode ?? fieldName. Read the prior field from the fold map; reject a different sourceField for the same dataset/field key.',
      'Replace the field map entry with fieldExpression. Numeric classification persists once any accepted observation or reviewed metadata makes the field numeric.',
      'For each field localisation, project locale, name, description and field metadata through statisticLocalisationRule; add datasetCode/fieldName and replace the matching locale map entry.',
      'Set the measure entry to {datasetCode, measureCode}. Select reviewedMeasure using datasetCode + U+0000 + measureCode. When field metadata and a measure registry are supplied, require the referenced reviewed measure.',
      'Use reviewedMeasure.localisations ?? fieldLocalisations. Project through statisticLocalisationRule and add datasetCode/measureCode. Reject a conflicting JSON representation for an existing measure/locale key.',
      'Return arrays from the four maps in insertion order, before versionStatisticsDefinitions adds hashes.',
    ],
    fieldExpression: {
      datasetCode: 'row.datasetCode',
      fieldName: 'metadata?.fieldName ?? sourceField',
      measureCode: 'metadata?.measureCode ?? fieldName',
      sourceField: 'sourceField',
      aggregation: 'metadata?.aggregation ?? "unreviewed"',
      aggregationPercentile: 'metadata?.aggregationPercentile ?? null',
      comparability: 'metadata?.comparability ?? null',
      denominatorFieldName: 'metadata?.denominatorFieldName ?? null',
      dimensions: 'metadata?.dimensions ?? {}',
      periodicity: 'metadata?.periodicity ?? null',
      sourceNullOption: 'metadata?.sourceNullOption ?? null',
      statisticKind: 'metadata?.statisticKind ?? "unreviewed"',
      unitCode: 'metadata?.unitCode ?? unitFor(datasetCode, sourceField)',
      valueKind:
        'parsed.numericValue !== null || parsed.observationStatus !== "published" || metadata || existingField?.valueKind === "numeric" ? "numeric" : "categorical"',
    },
    fieldLocalisations:
      'metadata?.localisations ?? [{description:null,isTranslationVerified:true,locale:"en",name:sourceField}]',
    observationClassification: {
      numeric: 'A literal matching /^[+-]?\\d+(?:\\.\\d+)?$/ is numeric and published.',
      suppressed:
        'The exact literal ** is suppressed and therefore makes its field numeric.',
      unavailable:
        'The exact literals -, N.A. and NA are unavailable and therefore make their field numeric.',
      categorical:
        'Other non-null literals are published categorical values unless another accepted observation or metadata makes the field numeric.',
    },
    defaultUnits: {
      datasetCode: 'ds-hk-hkgov-censtatd-land-area-population-density-district',
      mapping: {
        LA: 'square-kilometre',
        MYPOPN_LAND: 'person',
        POPN_D: 'person-per-square-kilometre',
      },
      otherwise: 'publisher-unknown',
    },
    outputs: ['fields', 'fieldsI18n', 'measures', 'measuresI18n'],
  }
}
