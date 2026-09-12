import type { StatsAggregation, StatsStatisticKind } from '@repo/db'
import {
  colorGrey,
  colorRed,
  colorTeal,
  colorYellow,
} from '../local/progressFormatting.ts'
import type {
  CenstatdFieldCurationEntry,
  CenstatdFieldLocalisation,
  CenstatdSchemaMeasureCandidate,
} from './censtatdMeasureCurationTypes.ts'
import {
  canonicalMeasureTokens,
  formatProposalLocalisation,
  intersectionSize,
  schemaCandidateLocalisation,
} from './censtatdMeasureCurationLocalisation.ts'

export function formatCenstatdFieldProposal(input: {
  candidate: Pick<CenstatdSchemaMeasureCandidate, 'localisations' | 'fieldName'>
  sourceField: string
  suggestedUnitCode: string | null
}) {
  const english = schemaCandidateLocalisation(input.candidate, 'en')
  const zhHant = schemaCandidateLocalisation(input.candidate, 'zh-Hant')
  const zhHans = schemaCandidateLocalisation(input.candidate, 'zh-Hans')
  if (!english || !zhHant || !zhHans)
    throw new Error('C&SD proposal is missing a required localisation.')
  return [
    `${colorRed(input.sourceField)}${colorTeal(' -> ')}${colorYellow(input.candidate.fieldName)}${input.suggestedUnitCode ? colorGrey(` (${input.suggestedUnitCode})`) : ''}`,
    '',
    formatProposalLocalisation('name', english.name, zhHant.name, zhHans.name),
    formatProposalLocalisation(
      'description',
      english.description,
      zhHant.description,
      zhHans.description,
    ),
  ].join('\n')
}

export function suggestUnitCode(
  fieldName: string,
  reviewedMeasures: readonly Pick<
    CenstatdFieldCurationEntry,
    'fieldName' | 'unitCode'
  >[],
) {
  const measureTokens = canonicalMeasureTokens(fieldName)
  const candidates = reviewedMeasures
    .filter(entry => entry.unitCode !== 'publisher-unknown')
    .filter(entry => measureTokens.has('density') || !entry.unitCode.includes('-per-'))
    .map(entry => ({
      entry,
      score: intersectionSize(measureTokens, canonicalMeasureTokens(entry.fieldName)),
    }))
    .filter(candidate => candidate.score > 0)
  const bestScore = Math.max(...candidates.map(candidate => candidate.score), 0)
  const units = new Set(
    candidates
      .filter(candidate => candidate.score === bestScore)
      .map(candidate => candidate.entry.unitCode),
  )
  return units.size === 1 ? (units.values().next().value ?? null) : null
}

export function suggestStatisticKind(input: {
  localisations?: readonly CenstatdFieldLocalisation[]
  fieldName: string
  unitCode: string | null
}): Exclude<StatsStatisticKind, 'unreviewed'> {
  const english = input.localisations?.find(
    localisation => localisation.locale === 'en',
  )
  const proposedText = `${english?.name ?? ''} ${english?.description ?? ''}`
  const proposedKind = suggestStatisticKindFromText(proposedText)
  if (proposedKind) return proposedKind

  const name = input.fieldName.toLocaleLowerCase('en')
  const unit = input.unitCode?.toLocaleLowerCase('en') ?? ''
  if (name.includes('percent') || name.includes('percentage') || unit === 'percent')
    return 'proportion'
  if (name.includes('ratio')) return 'ratio'
  if (name.includes('density')) return 'density'
  if (name.includes('rate') || unit.includes('-per-')) return 'rate'
  if (
    name.includes('count') ||
    name.includes('population') ||
    name.includes('number') ||
    name.includes('total')
  ) {
    return 'count'
  }
  if (name.includes('index')) return 'index'
  return 'quantity'
}

export function suggestSeriesFieldMetadata(input: {
  decisions: readonly CenstatdFieldCurationEntry[]
  localisations: readonly CenstatdFieldLocalisation[]
}): {
  aggregation: Exclude<StatsAggregation, 'unreviewed'> | null
  aggregationPercentile: number | null
  denominatorFieldName: string | null
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'> | null
} {
  const signature = measureSeriesSignature(input.localisations)
  if (!signature)
    return {
      aggregation: null,
      aggregationPercentile: null,
      denominatorFieldName: null,
      statisticKind: null,
    }
  const peers = input.decisions.filter(
    decision => measureSeriesSignature(decision.localisations) === signature,
  )
  return {
    aggregation: uniqueSuggestion(peers.map(peer => peer.aggregation)),
    aggregationPercentile: uniqueSuggestion(
      peers.map(peer => peer.aggregationPercentile ?? null),
    ),
    denominatorFieldName: uniqueSuggestion(
      peers.map(peer => peer.denominatorFieldName ?? null),
    ),
    statisticKind: uniqueSuggestion(peers.map(peer => peer.statisticKind)),
  }
}

function measureSeriesSignature(localisations: readonly CenstatdFieldLocalisation[]) {
  const english = localisations.find(localisation => localisation.locale === 'en')
  if (!english) return null
  return english.description
    .toLocaleLowerCase('en')
    .replace(
      /\baged?\s+(?:under\s+)?\d+(?:\s*(?:-|to)\s*\d+)?(?:\s+and\s+over)?\b/g,
      'age-group',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueSuggestion<T>(values: readonly T[]): T | null {
  const distinct = new Set(values)
  return distinct.size === 1 ? (distinct.values().next().value ?? null) : null
}

function suggestStatisticKindFromText(
  text: string,
): Exclude<StatsStatisticKind, 'unreviewed'> | null {
  if (/\b(?:percent|percentage|proportion|share)\b/i.test(text)) return 'proportion'
  if (/\bratio\b/i.test(text)) return 'ratio'
  if (/\bdensity\b/i.test(text)) return 'density'
  if (/\brate\b/i.test(text)) return 'rate'
  if (/\bindex\b/i.test(text)) return 'index'
  if (/\b(?:count|population|number|total)\b/i.test(text)) return 'count'
  return null
}

/**
 * Suggests an aggregation explicitly named in the publisher's proposed English
 * semantic text. This is deliberately separate from statistic-kind inference:
 * a quantity can be a total, mean, or median.
 */
export function suggestAggregation(
  localisations: readonly CenstatdFieldLocalisation[],
): Exclude<StatsAggregation, 'unreviewed'> | null {
  const english = localisations.find(localisation => localisation.locale === 'en')
  if (!english) return null

  const text = `${english.name} ${english.description}`
  const aggregationTerms: ReadonlyArray<
    readonly [RegExp, Exclude<StatsAggregation, 'unreviewed'>]
  > = [
    [/\b(?:first|lower|third|upper)\s+quartile\b/i, 'percentile'],
    [/\bmedian\b/i, 'median'],
    [/\b(?:mean|average)\b/i, 'mean'],
    [/\b(?:minimum|min)\b/i, 'minimum'],
    [/\b(?:maximum|max)\b/i, 'maximum'],
    [/\b(?:total|sum)\b/i, 'total'],
    [/\bpercentile\b/i, 'percentile'],
  ]
  return aggregationTerms.find(([term]) => term.test(text))?.[1] ?? null
}

export function suggestAggregationPercentile(
  localisations: readonly CenstatdFieldLocalisation[],
) {
  const english = localisations.find(localisation => localisation.locale === 'en')
  if (!english) return null
  const text = `${english.name} ${english.description}`
  if (/\bmedian\b/i.test(text)) return 50
  if (/\b(?:first|lower)\s+quartile\b/i.test(text)) return 25
  if (/\b(?:third|upper)\s+quartile\b/i.test(text)) return 75
  return null
}

const selectableAggregations = [
  'none',
  'total',
  'mean',
  'median',
  'minimum',
  'maximum',
  'percentile',
] as const satisfies readonly Exclude<StatsAggregation, 'unreviewed'>[]

/**
 * Totals preserve additive count and quantity fields only. Summing a ratio,
 * proportion, rate, density, or index does not retain that statistic kind.
 */
export function validAggregationsForStatisticKind(
  statisticKind: Exclude<StatsStatisticKind, 'unreviewed'>,
): readonly Exclude<StatsAggregation, 'unreviewed'>[] {
  return statisticKind === 'count' || statisticKind === 'quantity'
    ? selectableAggregations
    : selectableAggregations.filter(aggregation => aggregation !== 'total')
}

export function suggestPeriodicity(
  localisations: readonly CenstatdFieldLocalisation[],
) {
  const english = localisations.find(localisation => localisation.locale === 'en')
  const text = `${english?.name ?? ''} ${english?.description ?? ''}`
  if (/\bweekly\b/i.test(text)) return 'week' as const
  if (/\bmonthly\b/i.test(text)) return 'month' as const
  if (/\bquarterly\b/i.test(text)) return 'quarter' as const
  if (/\byearly|annual\b/i.test(text)) return 'year' as const
  if (/\bdaily\b/i.test(text)) return 'day' as const
  return null
}
