import { confirm, isCancel, note, select, text } from '@clack/prompts'
import type { StatsAggregation, StatsPeriodicity, StatsStatisticKind } from '@repo/db'
import { formatField } from '../cli/display.ts'
import {
  DEFAULT_UNITS_PATH,
  type CenstatdFieldCurationRegistry,
  type CenstatdFieldForCuration,
  type CenstatdFieldLocalisation,
  type CenstatdSchemaMeasureCandidate,
} from './censtatdMeasureCurationTypes.ts'
import { ensureCenstatdUnit, measureKey } from './censtatdMeasureCurationRegistry.ts'
import {
  formatCenstatdFieldProposal,
  suggestAggregation,
  suggestAggregationPercentile,
  suggestPeriodicity,
  suggestSeriesFieldMetadata,
  suggestStatisticKind,
  suggestUnitCode,
  validAggregationsForStatisticKind,
} from './censtatdMeasureCurationProposals.ts'
import { requiredFieldName, requiredText } from './censtatdMeasureCurationValidation.ts'
import { suggestMeasureName } from './censtatdMeasureCurationSchema.ts'
import {
  isLocalisationVerified,
  reviewedLocalisationOrigin,
  resolveChineseLocalisationProposals,
  schemaCandidateLocalisation,
} from './censtatdMeasureCurationLocalisation.ts'

export function resolveCenstatdFieldCuration(input: {
  registry: CenstatdFieldCurationRegistry
  fields: readonly CenstatdFieldForCuration[]
}) {
  const decisions = new Map(
    input.registry.fields.map(item => [measureKey(item), item] as const),
  )
  const unresolved = input.fields.filter(field => !decisions.has(measureKey(field)))
  return {
    metadata: new Map(
      input.fields.flatMap(field => {
        const decision = decisions.get(measureKey(field))
        return decision
          ? [
              [
                measureKey(field),
                {
                  aggregation: decision.aggregation,
                  ...(decision.aggregationPercentile === undefined
                    ? {}
                    : { aggregationPercentile: decision.aggregationPercentile }),
                  ...(decision.periodicity === undefined
                    ? {}
                    : { periodicity: decision.periodicity }),
                  ...(decision.comparability === undefined
                    ? {}
                    : { comparability: decision.comparability }),
                  ...(decision.denominatorFieldName === undefined
                    ? {}
                    : { denominatorFieldName: decision.denominatorFieldName }),
                  dimensions: decision.dimensions,
                  localisations: decision.localisations,
                  fieldName: decision.fieldName,
                  measureCode: decision.measureCode,
                  ...(decision.sourceNullOption === undefined
                    ? {}
                    : { sourceNullOption: decision.sourceNullOption }),
                  statisticKind: decision.statisticKind,
                  unitCode: decision.unitCode,
                },
              ] as const,
            ]
          : []
      }),
    ),
    unresolved,
  }
}

export async function promptForCenstatdFieldCuration(input: {
  registry: CenstatdFieldCurationRegistry
  fields: readonly CenstatdFieldForCuration[]
  persist?: (registry: CenstatdFieldCurationRegistry) => Promise<void>
  schemaCandidates: ReadonlyMap<string, CenstatdSchemaMeasureCandidate>
}) {
  const decisions = [...input.registry.fields]
  const persist = () => input.persist?.({ fields: decisions }) ?? Promise.resolve()
  for (const field of input.fields) {
    const schemaCandidate = input.schemaCandidates.get(measureKey(field))
    note(
      formatCenstatdFieldReviewContext({ field, schemaCandidate }),
      'MEASURE METADATA',
    )

    let fieldName: string | null = null
    let localisations: readonly CenstatdFieldLocalisation[] | null = null
    let acceptedSchemaCandidate = false
    if (schemaCandidate) {
      note(
        formatCenstatdFieldProposal({
          candidate: schemaCandidate,
          sourceField: field.sourceField,
          suggestedUnitCode: suggestUnitCode(schemaCandidate.fieldName, decisions),
        }),
        'PROPOSALS',
      )
      const accepted = await confirm({
        initialValue: true,
        message: 'Accept the proposed CSDI field name and description?',
      })
      if (isCancel(accepted)) throw new Error('C&SD field curation cancelled.')
      if (accepted) {
        acceptedSchemaCandidate = true
        fieldName = schemaCandidate.fieldName
        localisations = schemaCandidate.localisations
      }
    }

    if (!fieldName || !localisations) {
      fieldName = await requiredFieldName(
        'Canonical field key',
        schemaCandidate?.fieldName ?? suggestMeasureName(field.sourceField),
      )
      const englishName = await requiredText(
        'English field name',
        schemaCandidateLocalisation(schemaCandidate, 'en')?.name ??
          suggestMeasureName(field.sourceField),
      )
      const englishDescription = await requiredText(
        'English field description',
        schemaCandidateLocalisation(schemaCandidate, 'en')?.description,
      )
      const chineseProposals = await resolveChineseLocalisationProposals({
        candidate: schemaCandidate,
        englishDescription,
        englishName,
      })
      const traditionalChineseName = await requiredText(
        'Traditional Chinese field name',
        chineseProposals.zhHant?.name,
      )
      const traditionalChineseDescription = await requiredText(
        'Traditional Chinese field description',
        chineseProposals.zhHant?.description,
      )
      const simplifiedChineseName = await requiredText(
        'Simplified Chinese field name',
        chineseProposals.zhHans?.name,
      )
      const simplifiedChineseDescription = await requiredText(
        'Simplified Chinese field description',
        chineseProposals.zhHans?.description,
      )
      localisations = [
        {
          description: englishDescription,
          isTranslationVerified: true,
          locale: 'en',
          name: englishName,
          origin: reviewedLocalisationOrigin(
            schemaCandidateLocalisation(schemaCandidate, 'en'),
            englishName,
            englishDescription,
          ),
        },
        {
          description: traditionalChineseDescription,
          isTranslationVerified: isLocalisationVerified(
            chineseProposals.zhHant,
            traditionalChineseName,
            traditionalChineseDescription,
          ),
          locale: 'zh-Hant',
          name: traditionalChineseName,
          origin: reviewedLocalisationOrigin(
            chineseProposals.zhHant,
            traditionalChineseName,
            traditionalChineseDescription,
            { name: englishName, description: englishDescription },
          ),
        },
        {
          description: simplifiedChineseDescription,
          isTranslationVerified: isLocalisationVerified(
            chineseProposals.zhHans,
            simplifiedChineseName,
            simplifiedChineseDescription,
          ),
          locale: 'zh-Hans',
          name: simplifiedChineseName,
          origin: reviewedLocalisationOrigin(
            chineseProposals.zhHans,
            simplifiedChineseName,
            simplifiedChineseDescription,
            { name: englishName, description: englishDescription },
          ),
        },
      ]
    }

    const suggestedUnitCode = suggestUnitCode(fieldName, decisions)
    const measureCode = await requiredFieldName('Canonical measure code', fieldName)
    const seriesMetadata = suggestSeriesFieldMetadata({
      decisions,
      localisations,
    })
    const statisticKind = await selectStatisticKind({
      localisations,
      field,
      fieldName,
      suggestedStatisticKind: seriesMetadata.statisticKind,
      suggestedUnitCode,
    })
    const aggregation = await selectAggregation({
      statisticKind,
      suggestedAggregation:
        seriesMetadata.aggregation ?? suggestAggregation(localisations),
    })
    const aggregationPercentile = await selectAggregationPercentile({
      aggregation,
      suggestedAggregationPercentile:
        seriesMetadata.aggregationPercentile ??
        suggestAggregationPercentile(localisations),
    })
    const periodicity = await selectPeriodicity({
      suggestedPeriodicity: suggestPeriodicity(localisations),
    })
    const denominatorFieldName = await optionalDenominatorFieldName({
      statisticKind,
      suggestedDenominatorFieldName: seriesMetadata.denominatorFieldName,
    })
    const resolvedUnitCode = acceptedSchemaCandidate
      ? (suggestedUnitCode ?? field.unitCode)
      : await promptForCenstatdUnitCode(field.unitCode, suggestedUnitCode)
    await ensureCenstatdUnit({ code: resolvedUnitCode, path: DEFAULT_UNITS_PATH })
    decisions.push({
      aggregation,
      ...(aggregationPercentile === undefined ? {} : { aggregationPercentile }),
      ...(periodicity === undefined ? {} : { periodicity }),
      datasetCode: field.datasetCode,
      ...(denominatorFieldName ? { denominatorFieldName } : {}),
      dimensions: {},
      localisations,
      fieldName,
      measureCode,
      ...(schemaCandidate
        ? {
            schemaSpecification: schemaCandidate.schemaSpecification,
            sourceNullOption: schemaCandidate.sourceNullOption,
          }
        : {}),
      sourceField: field.sourceField,
      statisticKind,
      unitCode: resolvedUnitCode,
    })
    await persist()
  }
  return { fields: decisions }
}

async function promptForCenstatdUnitCode(
  sourceUnitCode: string,
  suggestedUnitCode: string | null,
) {
  const unitCode = await text({
    initialValue:
      sourceUnitCode === 'publisher-unknown'
        ? (suggestedUnitCode ?? '')
        : sourceUnitCode,
    message: 'Canonical unit code (leave blank when no unit mapping is reviewed)',
  })
  if (isCancel(unitCode)) throw new Error('C&SD field curation cancelled.')
  return (unitCode ?? '').trim() || 'publisher-unknown'
}

/** Gives enough semantic context to review a field before choosing its kind. */
export function formatCenstatdFieldReviewContext(input: {
  field: CenstatdFieldForCuration
  schemaCandidate?: Pick<
    CenstatdSchemaMeasureCandidate,
    'localisations' | 'sourceReleaseUrl'
  >
}) {
  const proposed = schemaCandidateLocalisation(input.schemaCandidate, 'en')
  return [
    formatField('dataset', input.field.datasetCode),
    formatField(
      'proposed name',
      proposed?.name ?? suggestMeasureName(input.field.sourceField),
    ),
    ...(proposed?.description
      ? [formatField('proposed description', proposed.description)]
      : []),
    formatField('value kind', input.field.valueKind),
    ...(input.schemaCandidate
      ? [formatField('source release', input.schemaCandidate.sourceReleaseUrl)]
      : []),
  ].join('\n')
}

async function selectStatisticKind(input: {
  localisations: readonly CenstatdFieldLocalisation[]
  field: CenstatdFieldForCuration
  fieldName: string
  suggestedStatisticKind: Exclude<StatsStatisticKind, 'unreviewed'> | null
  suggestedUnitCode: string | null
}): Promise<Exclude<StatsStatisticKind, 'unreviewed'>> {
  const value = await select({
    initialValue:
      input.suggestedStatisticKind ??
      suggestStatisticKind({
        localisations: input.localisations,
        fieldName: input.fieldName,
        unitCode: input.suggestedUnitCode ?? input.field.unitCode,
      }),
    message: 'Statistic kind',
    options: [
      {
        hint: 'Discrete entities, such as people or dwellings.',
        label: 'Count',
        value: 'count',
      },
      {
        hint: 'Physical, monetary, or other measured amount.',
        label: 'Quantity',
        value: 'quantity',
      },
      {
        hint: 'A share of a whole, whether stored as a fraction or percentage.',
        label: 'Proportion',
        value: 'proportion',
      },
      { hint: 'A comparison between two quantities.', label: 'Ratio', value: 'ratio' },
      {
        hint: 'A quantity per population or time.',
        label: 'Rate',
        value: 'rate',
      },
      {
        hint: 'A quantity per unit area.',
        label: 'Density',
        value: 'density',
      },
      { hint: 'An indexed value relative to a base.', label: 'Index', value: 'index' },
    ],
  })
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  return value as Exclude<StatsStatisticKind, 'unreviewed'>
}

async function selectAggregation(input: {
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  suggestedAggregation?: Exclude<StatsAggregation, 'unreviewed'> | null
}): Promise<Exclude<StatsAggregation, 'unreviewed'>> {
  const validAggregations = validAggregationsForStatisticKind(input.statisticKind)
  const fallbackAggregation =
    input.statisticKind === 'count' || input.statisticKind === 'quantity'
      ? 'total'
      : 'none'
  const suggestedAggregation = input.suggestedAggregation
  const initialValue =
    suggestedAggregation && validAggregations.includes(suggestedAggregation)
      ? suggestedAggregation
      : fallbackAggregation
  const options: ReadonlyArray<{
    hint: string
    label: string
    value: Exclude<StatsAggregation, 'unreviewed'>
  }> = [
    {
      hint: 'No aggregation; the publisher supplies a direct value.',
      label: 'None',
      value: 'none',
    },
    { hint: 'The values are summed.', label: 'Total', value: 'total' },
    { hint: 'Arithmetic average.', label: 'Mean', value: 'mean' },
    { hint: 'Middle value.', label: 'Median', value: 'median' },
    { hint: 'Smallest value.', label: 'Minimum', value: 'minimum' },
    { hint: 'Largest value.', label: 'Maximum', value: 'maximum' },
    { hint: 'A named percentile.', label: 'Percentile', value: 'percentile' },
  ]
  const value = await select({
    initialValue,
    message: 'Aggregation',
    options: options.filter(option => validAggregations.includes(option.value)),
  })
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  return value as Exclude<StatsAggregation, 'unreviewed'>
}

async function selectAggregationPercentile(input: {
  aggregation: Exclude<StatsAggregation, 'unreviewed'>
  suggestedAggregationPercentile: number | null
}): Promise<number | undefined> {
  if (input.aggregation === 'median') return 50
  if (input.aggregation !== 'percentile') return undefined
  const value = await text({
    initialValue: input.suggestedAggregationPercentile?.toString(),
    message: 'Percentile rank (0–100)',
  })
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  const percentileText = value.trim()
  const percentile = Number(percentileText)
  if (
    !percentileText ||
    !Number.isFinite(percentile) ||
    percentile < 0 ||
    percentile > 100
  ) {
    throw new Error('C&SD percentile rank must be a number from 0 to 100.')
  }
  return percentile
}

async function selectPeriodicity(input: {
  suggestedPeriodicity: StatsPeriodicity | null
}): Promise<StatsPeriodicity | undefined> {
  const value = await select({
    initialValue: input.suggestedPeriodicity ?? 'none',
    message: 'Periodicity',
    options: [
      {
        hint: 'The value is not expressed over a named interval.',
        label: 'None',
        value: 'none',
      },
      { hint: 'Per day.', label: 'Day', value: 'day' },
      { hint: 'Per week.', label: 'Week', value: 'week' },
      { hint: 'Per month.', label: 'Month', value: 'month' },
      { hint: 'Per quarter.', label: 'Quarter', value: 'quarter' },
      { hint: 'Per year.', label: 'Year', value: 'year' },
    ],
  })
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  return value === 'none' ? undefined : (value as StatsPeriodicity)
}

async function optionalDenominatorFieldName(input: {
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>
  suggestedDenominatorFieldName: string | null
}) {
  if (!['proportion', 'ratio', 'rate', 'density'].includes(input.statisticKind))
    return undefined
  const value = await text({
    initialValue: input.suggestedDenominatorFieldName ?? undefined,
    message: 'Canonical denominator field key (leave blank when the base is external)',
  })
  if (isCancel(value)) throw new Error('C&SD field curation cancelled.')
  const denominatorFieldName = value.trim()
  if (!denominatorFieldName) return undefined
  if (!/^[a-z][A-Za-z0-9]*$/.test(denominatorFieldName))
    throw new Error('C&SD denominator field key must be lower camel case.')
  return denominatorFieldName
}

export type {
  CenstatdFieldCurationEntry,
  CenstatdFieldCurationManifest,
  CenstatdFieldForCuration,
  CenstatdFieldMetadata,
  CenstatdMeasureMetadata,
  CenstatdFieldLocalisation,
} from './censtatdMeasureCurationTypes.ts'

export {
  resolveCenstatdFieldMetadata,
  loadCenstatdFieldCuration,
  loadCenstatdMeasureMetadata,
  saveCenstatdFieldCuration,
  resolveUnitLocalisations,
  emptyCenstatdFieldCuration,
  parseCenstatdFieldCuration,
} from './censtatdMeasureCurationRegistry.ts'

export {
  resolveCenstatdSchemaMeasureCandidates,
  parseCsdiSimplifiedDataSpecification,
  suggestMeasureName,
} from './censtatdMeasureCurationSchema.ts'

export {
  formatCenstatdFieldProposal,
  suggestUnitCode,
  suggestStatisticKind,
  suggestSeriesFieldMetadata,
  suggestAggregation,
  suggestAggregationPercentile,
  validAggregationsForStatisticKind,
} from './censtatdMeasureCurationProposals.ts'

export { resolveChineseLocalisationProposals } from './censtatdMeasureCurationLocalisation.ts'
