import ruleFixture from '../../../../../../fixtures/meta/processing-rules/statistic-normalisation.json'
import { ruleDeclarationFromFixture } from '@repo/core/provenance'
import { createHash } from 'node:crypto'
import { statisticFieldCurationRule } from './statisticFieldCurationRule'
import { statisticLocalisationRule } from './statisticLocalisationRule'
import { populationThousandsRule } from '@repo/core/pipeline/services/statistics/statisticRules'
import {
  guardSession,
  registerRule,
  statisticGuardDefinitions,
  type AuditGuard,
} from '@repo/core/provenance'
import type {
  CenstatdCanonicalDimension,
  CenstatdCanonicalDimensionValue,
  CenstatdCanonicalField,
  CenstatdCanonicalObservation,
} from '@repo/core/pipeline/services/metrics/censtatdReleaseStats'
import type {
  CanonicalStatsGeography,
  StatsAggregation,
  StatsFieldComparability,
  StatsPeriodicity,
  StatsStatisticKind,
} from '@repo/db'
import { parseStatisticsReferencePeriod } from '@repo/core/pipeline/services/statistics/statisticsReferencePeriod'
import {
  hashStatisticContent,
  versionStatisticsDefinitions,
} from './statisticsRecordIdentity.ts'

import type {
  CenstatdFieldMetadata,
  CenstatdMeasureMetadata,
} from './censtatdMeasureCuration.ts'

type Row = Record<string, unknown>

type CanonicalObservation = CenstatdCanonicalObservation & {
  id: string
  seriesId: string
  sourceField: string
  sourceValue: string
  unitCode: string
  valueCode: string | null
  valuePrecision: string | null
}

type CanonicalSeries = {
  datasetCode: string
  divisionId: string | null
  geography: CanonicalStatsGeography
  id: string
  referencePeriodCode: string
  referencePeriodEnd: string | null
  referencePeriodEndYear: string
  referencePeriodGranularity: string
  referencePeriodStart: string | null
  sourceFeatureRef: string
  sourceReleaseId: string
}

type CanonicalRecord = CanonicalSeries & {
  fieldDefinitionHashes: Record<string, string>
  fieldSources: Record<string, { sourceFeatureRef: string; sourceReleaseId: string }>
  values: Record<string, string>
}

type CanonicalField = CenstatdCanonicalField & {
  aggregation: StatsAggregation
  comparability: StatsFieldComparability | null
  datasetCode: string
  denominatorFieldName: string | null
  periodicity: StatsPeriodicity | null
  measureCode: string
  sourceField: string
  sourceNullOption: string | null
  statisticKind: StatsStatisticKind
  valueKind: 'categorical' | 'numeric'
}

type CanonicalMeasure = {
  datasetCode: string
  measureCode: string
}

type CanonicalDimension = CenstatdCanonicalDimension & { datasetCode: string }
type CanonicalDimensionValue = CenstatdCanonicalDimensionValue & {
  datasetCode: string
}

export type CanonicalStatsRows = {
  auditGuards?: AuditGuard[]
  dimensions: CanonicalDimension[]
  fields: Array<CanonicalField & { measureVersionHash: string; versionHash: string }>
  fieldsI18n: Row[]
  measures: Array<CanonicalMeasure & { versionHash: string }>
  measuresI18n: Row[]
  observations: CanonicalObservation[]
  records: CanonicalRecord[]
  values: CanonicalDimensionValue[]
  valuesI18n: Row[]
}

export type HkgovCenstatdStatisticSourceRow = {
  areaCompanionByReferencePeriod?: Record<
    string,
    { cohortKey: string; domainCode: string; variant: string }
  >
  datasetCode: string
  divisionId?: string | null
  /** Reviewed public geography; source identifiers remain in the raw row/ref. */
  geography?: CanonicalStatsGeography
  properties: Record<string, unknown>
  sourceFeatureRef: string
  sourceReleaseId: string
  sourceVersion: string
}

/**
 * Converts publisher-native C&SD properties into compact canonical records
 * without guessing semantic labels or discarding source literals. Geometry is
 * deliberately excluded: it remains a source record until it is reviewed
 * into the Divisions family.
 */
function normaliseStatistics(
  input: HkgovCenstatdStatisticSourceRow[],
  options: {
    fieldMetadata?: ReadonlyMap<string, CenstatdFieldMetadata>
    measureMetadata?: ReadonlyMap<string, CenstatdMeasureMetadata>
  } = {},
): CanonicalStatsRows {
  const guards = guardSession(statisticGuardDefinitions)
  if (!options.measureMetadata)
    guards.notApplicable(
      'statistic-measure-registration',
      'No separate measure registry was supplied to this normalisation.',
    )
  if (!input.length)
    for (const definition of statisticGuardDefinitions)
      guards.notApplicable(definition.id, 'There are no input records to check.')
  const observations: CanonicalObservation[] = []
  const fields = new Map<string, CanonicalField>()
  const fieldsI18n = new Map<string, Row>()
  const measures = new Map<string, CanonicalMeasure>()
  const measuresI18n = new Map<string, Row>()
  const series = new Map<string, CanonicalSeries>()
  const observationsBySeries = new Map<string, CanonicalObservation[]>()

  for (const row of input) {
    const { profile, referencePeriod } = guards.check(
      'statistic-reference-period',
      () => {
        const profile = profileFor(row.datasetCode, row.properties, row.sourceVersion)
        return {
          profile,
          referencePeriod: parseStatisticsReferencePeriod(profile.referencePeriodCode),
        }
      },
    )
    const seriesId = seriesIdentifier({
      datasetCode: row.datasetCode,
      referencePeriodCode: profile.referencePeriodCode,
      sourceFeatureRef: row.sourceFeatureRef,
    })
    const geography = guards.check('statistic-area-companion', () =>
      withAreaCompanion(
        row.geography ??
          geographyFor(
            profile.dimensions,
            row.sourceFeatureRef.replace(
              `hkgov-censtatd/${row.datasetCode}/${row.sourceVersion}/`,
              '',
            ),
          ),
        row.areaCompanionByReferencePeriod,
        referencePeriod.endYear,
      ),
    )
    series.set(seriesId, {
      datasetCode: row.datasetCode,
      divisionId: row.divisionId ?? null,
      geography,
      id: seriesId,
      referencePeriodCode: profile.referencePeriodCode,
      referencePeriodEnd: referencePeriod.end,
      referencePeriodEndYear: referencePeriod.endYear,
      referencePeriodGranularity: referencePeriod.granularity,
      referencePeriodStart: referencePeriod.start,
      sourceFeatureRef: row.sourceFeatureRef,
      sourceReleaseId: row.sourceReleaseId,
    })
    for (const [sourceField, raw] of Object.entries(row.properties)) {
      if (profile.identifierFields.has(sourceField)) continue
      const sourceValue = literal(raw)
      if (sourceValue === null) continue
      const parsed = parseObservationValue(sourceField, sourceValue)
      const metadata = statisticFieldCurationRule.execute({
        metadata: options.fieldMetadata,
        datasetCode: row.datasetCode,
        sourceField,
      })
      const fieldName = metadata?.fieldName ?? sourceField
      const measureCode = metadata?.measureCode ?? fieldName
      const observationId = observationIdentifier({
        fieldName,
        seriesId,
      })
      const observation = {
        id: observationId,
        seriesId,
        sourceField,
        referencePeriodCode: profile.referencePeriodCode,
        fieldName,
        numericValue: parsed.numericValue,
        valueCode: parsed.valueCode,
        unitCode: metadata?.unitCode ?? unitFor(row.datasetCode, sourceField),
        valuePrecision: parsed.valuePrecision,
        observationStatus: parsed.observationStatus,
        sourceValue,
      } satisfies CanonicalObservation
      observations.push(observation)
      const recordObservations = observationsBySeries.get(seriesId) ?? []
      recordObservations.push(observation)
      observationsBySeries.set(seriesId, recordObservations)
      const fieldKey = [row.datasetCode, fieldName].join('\u0000')
      const existingField = fields.get(fieldKey)
      const valueKind =
        parsed.numericValue !== null ||
        parsed.observationStatus !== 'published' ||
        metadata ||
        existingField?.valueKind === 'numeric'
          ? 'numeric'
          : 'categorical'
      const field: CanonicalField = {
        aggregation: metadata?.aggregation ?? 'unreviewed',
        aggregationPercentile: metadata?.aggregationPercentile ?? null,
        comparability: metadata?.comparability ?? null,
        datasetCode: row.datasetCode,
        dimensions: metadata?.dimensions ?? {},
        denominatorFieldName: metadata?.denominatorFieldName ?? null,
        fieldName,
        measureCode,
        periodicity: metadata?.periodicity ?? null,
        sourceField,
        sourceNullOption: metadata?.sourceNullOption ?? null,
        statisticKind: metadata?.statisticKind ?? 'unreviewed',
        valueKind,
        unitCode: metadata?.unitCode ?? unitFor(row.datasetCode, sourceField),
      }
      guards.check('statistic-dimension-field-uniqueness', () => {
        if (existingField && existingField.sourceField !== sourceField)
          throw new Error(
            `C&SD ${row.datasetCode} field ${fieldName} has conflicting definitions across publisher features.`,
          )
      })
      fields.set(fieldKey, field)
      const fieldLocalisations = metadata?.localisations ?? [
        {
          description: null,
          isTranslationVerified: true,
          locale: 'en' as const,
          name: sourceField,
        },
      ]
      for (const localisation of fieldLocalisations) {
        fieldsI18n.set(`${fieldKey}\u0000${localisation.locale}`, {
          datasetCode: row.datasetCode,
          fieldName,
          ...statisticLocalisationRule.execute(localisation),
        })
      }
      const measureKey = `${row.datasetCode}\u0000${measureCode}`
      measures.set(measureKey, { datasetCode: row.datasetCode, measureCode })
      const reviewedMeasure = options.measureMetadata?.get(measureKey)
      if (metadata && options.measureMetadata)
        guards.check('statistic-measure-registration', () => {
          if (!reviewedMeasure) {
            throw new Error(
              `C&SD ${row.datasetCode} field ${fieldName} references unregistered measure ${measureCode}.`,
            )
          }
        })
      const measureLocalisations = reviewedMeasure?.localisations ?? fieldLocalisations
      for (const localisation of measureLocalisations) {
        const key = `${measureKey}\u0000${localisation.locale}`
        const next = {
          datasetCode: row.datasetCode,
          measureCode,
          ...statisticLocalisationRule.execute(localisation),
        }
        const existing = measuresI18n.get(key)
        guards.check('statistic-measure-localisations', () => {
          if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
            throw new Error(
              `C&SD ${row.datasetCode} measure ${measureCode} has conflicting localisations.`,
            )
          }
        })
        measuresI18n.set(key, next)
      }
    }
  }

  const scaledPrecisionByMeasure = new Map<string, number>()
  for (const observation of observations) {
    if (!isPopulationThousands(observation.sourceField, observation.sourceValue))
      continue
    const key = `${observation.sourceField}\u0000${observation.fieldName}`
    scaledPrecisionByMeasure.set(
      key,
      Math.max(
        scaledPrecisionByMeasure.get(key) ?? 0,
        decimalPlaces(observation.sourceValue),
      ),
    )
  }
  for (const observation of observations) {
    const key = `${observation.sourceField}\u0000${observation.fieldName}`
    const decimalCount = scaledPrecisionByMeasure.get(key)
    if (decimalCount !== undefined)
      observation.valuePrecision = precisionAfterScaling(
        Math.log10(populationThousandsRule.declaration.parameters.factor),
        decimalCount,
      )
  }

  const definitions = versionStatisticsDefinitions({
    fields: [...fields.values()],
    fieldsI18n: [...fieldsI18n.values()],
    measures: [...measures.values()],
    measuresI18n: [...measuresI18n.values()],
  })
  const records = new Map<string, CanonicalRecord>()
  for (const seriesRow of [...series.values()].sort((left, right) =>
    left.sourceFeatureRef.localeCompare(right.sourceFeatureRef),
  )) {
    const id = recordIdentifier(seriesRow)
    const record = records.get(id) ?? {
      ...seriesRow,
      id,
      fieldDefinitionHashes: {},
      fieldSources: {},
      values: {},
    }
    guards.check('statistic-dimension-field-uniqueness', () => {
      if (
        record.divisionId !== seriesRow.divisionId ||
        hashStatisticContent(record.geography) !==
          hashStatisticContent(seriesRow.geography)
      )
        throw new Error(
          `C&SD ${seriesRow.datasetCode} record ${id} has conflicting geography metadata across publisher features.`,
        )
    })
    for (const observation of observationsBySeries.get(seriesRow.id) ?? []) {
      guards.check('statistic-dimension-field-uniqueness', () => {
        if (Object.hasOwn(record.values, observation.fieldName)) {
          throw new Error(
            `C&SD ${seriesRow.datasetCode} record ${id} has duplicate field ${observation.fieldName} across publisher features.`,
          )
        }
      })
      record.values[observation.fieldName] =
        observation.numericValue ?? observation.valueCode ?? observation.sourceValue
      record.fieldSources[observation.fieldName] = {
        sourceFeatureRef: seriesRow.sourceFeatureRef,
        sourceReleaseId: seriesRow.sourceReleaseId,
      }
      const definitionHash = definitions.fieldDefinitionHashes.get(
        `${seriesRow.datasetCode}\u0000${observation.fieldName}`,
      )
      if (!definitionHash)
        throw new Error(
          `Missing statistics field definition: ${observation.fieldName}.`,
        )
      record.fieldDefinitionHashes[observation.fieldName] = definitionHash
    }
    if (Object.keys(record.values).length) records.set(id, record)
  }

  return {
    dimensions: [],
    fields: definitions.fields,
    fieldsI18n: definitions.fieldsI18n,
    measures: definitions.measures,
    measuresI18n: definitions.measuresI18n,
    observations,
    records: [...records.values()],
    values: [],
    valuesI18n: [],
    auditGuards: guards.snapshot(),
  }
}

export const statisticNormalisationRule = registerRule(
  ruleDeclarationFromFixture(ruleFixture),
  ({
    input,
    options,
  }: {
    input: HkgovCenstatdStatisticSourceRow[]
    options: Parameters<typeof normaliseStatistics>[1]
  }) => normaliseStatistics(input, options),
)

export function normaliseHkgovCenstatdStatistics(
  input: HkgovCenstatdStatisticSourceRow[],
  options: Parameters<typeof normaliseStatistics>[1] = {},
) {
  return statisticNormalisationRule.execute({ input, options })
}

function withAreaCompanion(
  geography: CanonicalStatsGeography,
  companions:
    | Record<string, { cohortKey: string; domainCode: string; variant: string }>
    | undefined,
  referencePeriodEndYear: string,
) {
  const template = companions?.[referencePeriodEndYear] ?? companions?.['*']
  if (!template) return geography
  const areaCompanion = {
    cohortKey: template.cohortKey.replaceAll(
      '{referencePeriodEndYear}',
      referencePeriodEndYear,
    ),
    variant: template.variant.replaceAll(
      '{referencePeriodEndYear}',
      referencePeriodEndYear,
    ),
    domainCode: template.domainCode.replaceAll(
      '{referencePeriodEndYear}',
      referencePeriodEndYear,
    ),
  }
  if (!/^[a-z0-9][a-z0-9:-]*$/.test(areaCompanion.variant)) {
    throw new Error(
      `Invalid configured statistics area companion variant: ${areaCompanion.variant}.`,
    )
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(areaCompanion.cohortKey)) {
    throw new Error(
      `Invalid configured statistics area companion cohort: ${areaCompanion.cohortKey}.`,
    )
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(areaCompanion.domainCode)) {
    throw new Error(
      `Invalid configured statistics area companion domain: ${areaCompanion.domainCode}.`,
    )
  }
  return { ...geography, areaCompanion }
}

type Dimension = {
  code: string
  nameEn?: string
  nameZhHant?: string
  valueCode: string
}

function profileFor(
  datasetCode: string,
  properties: Record<string, unknown>,
  sourceVersion: string,
) {
  const dimensions: Dimension[] = []
  const identifierFields = new Set<string>()
  const add = (
    code: string,
    valueField: string,
    enField?: string,
    zhField?: string,
  ) => {
    identifierFields.add(valueField)
    if (enField) identifierFields.add(enField)
    if (zhField) identifierFields.add(zhField)
    const value = literal(properties[valueField])
    if (!value) return
    dimensions.push({
      code,
      nameEn: enField ? (literal(properties[enField]) ?? undefined) : undefined,
      nameZhHant: zhField ? (literal(properties[zhField]) ?? undefined) : undefined,
      valueCode: value,
    })
  }
  const reference = (field: string) => identifierFields.add(field)

  switch (datasetCode) {
    case 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups':
      add('housing-market-area', 'hma', 'hma_eng', 'hma_chi')
      if (properties.bg !== undefined) add('building-group', 'bg', 'bg_eng', 'bg_chi')
      if (properties.bg_ind !== undefined) add('building-group-class', 'bg_ind')
      return censusProfile(sourceVersion, dimensions, identifierFields)
    case 'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates':
      add('housing-estate', 'estate', 'estate_eng', 'estate_chi')
      reference('gml_id')
      return censusProfile(sourceVersion, dimensions, identifierFields)
    case 'ds-hk-hkgov-censtatd-division-statistic-new-towns':
      add('new-town', 'newtown', 'newtown_eng', 'newtown_chi')
      reference('gml_id')
      return censusProfile(sourceVersion, dimensions, identifierFields)
    case 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters':
      add('area', 'AREA_ENG', 'AREA_ENG', 'AREA_CHI')
      reference('PERIOD')
      return {
        dimensions,
        identifierFields,
        referencePeriodCode: requiredPeriodProperty(
          properties,
          'PERIOD',
          'C&SD permanent living quarters area row',
        ),
      }
    case 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district': {
      add('district', 'DC', 'DC_ENG', 'DC_CHI')
      reference('YEAR')
      reference('QUARTER')
      const year = requiredPeriodProperty(
        properties,
        'YEAR',
        'C&SD permanent living quarters district row',
      )
      const quarter = requiredPeriodProperty(
        properties,
        'QUARTER',
        'C&SD permanent living quarters district row',
      )
      return {
        dimensions,
        identifierFields,
        referencePeriodCode: `${year}-Q${quarter.replace(/^Q/i, '')}`,
      }
    }
    case 'ds-hk-hkgov-censtatd-division-statistic-population-households-district': {
      add('district', 'dc', 'dc_eng', 'dc_chi')
      add('district-class', 'dc_class')
      const year = literal(properties.year)
      if (!year) throw new Error('C&SD Population and Household row has no year.')
      reference('year')
      return {
        dimensions,
        identifierFields,
        referencePeriodCode: year,
      }
    }
    case 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district':
      add('district', 'dc', 'dc_eng', 'dc_chi')
      add('district-class', 'dc_class')
      return censusProfile(sourceVersion, dimensions, identifierFields)
    case 'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district':
      add('district', 'DC', 'DC_ENG', 'DC_CHI')
      reference('PERIOD')
      return {
        dimensions,
        identifierFields,
        referencePeriodCode: requiredPeriodProperty(
          properties,
          'PERIOD',
          'C&SD land area and population density row',
        ),
      }
    default:
      return {
        dimensions,
        identifierFields,
        referencePeriodCode: sourceVersion,
      }
  }
}

function censusProfile(
  sourceVersion: string,
  dimensions: Dimension[],
  identifierFields: Set<string>,
) {
  return {
    dimensions,
    identifierFields,
    referencePeriodCode: sourceVersion,
  }
}

function requiredPeriodProperty(
  properties: Record<string, unknown>,
  field: string,
  label: string,
) {
  const value = literal(properties[field])
  if (!value) throw new Error(`${label} has no ${field}.`)
  return value
}

function parseObservationValue(sourceField: string, sourceValue: string) {
  if (/^[+-]?\d+(?:\.\d+)?$/.test(sourceValue)) {
    const isScaledPopulation = isPopulationThousands(sourceField, sourceValue)
    return {
      numericValue: isScaledPopulation
        ? populationThousandsRule.execute(sourceValue)
        : sourceValue,
      observationStatus: 'published',
      valueCode: null,
      valuePrecision: null,
    }
  }
  if (sourceValue === '**') {
    return {
      numericValue: null,
      observationStatus: 'suppressed',
      valueCode: 'suppressed',
      valuePrecision: null,
    }
  }
  if (['-', 'N.A.', 'NA'].includes(sourceValue)) {
    return {
      numericValue: null,
      observationStatus: 'unavailable',
      valueCode: 'unavailable',
      valuePrecision: null,
    }
  }
  return {
    numericValue: null,
    observationStatus: 'published',
    valueCode: sourceValue,
    valuePrecision: null,
  }
}

function decimalPlaces(value: string) {
  return value.split('.')[1]?.length ?? 0
}

function precisionAfterScaling(scaleExponent: number, decimalCount: number) {
  const exponent = scaleExponent - decimalCount
  return exponent >= 0
    ? `1${'0'.repeat(exponent)}`
    : `0.${'0'.repeat(Math.abs(exponent) - 1)}1`
}

function isPopulationThousands(sourceField: string, sourceValue: string) {
  return (
    sourceField === populationThousandsRule.declaration.parameters.sourceField &&
    /^[+-]?\d+(?:\.\d+)?$/.test(sourceValue)
  )
}

function unitFor(datasetCode: string, sourceField: string) {
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
  ) {
    if (sourceField === 'LA') return 'square-kilometre'
    if (sourceField === 'MYPOPN_LAND') return 'person'
    if (sourceField === 'POPN_D') return 'person-per-square-kilometre'
  }
  return 'publisher-unknown'
}

function observationIdentifier(input: { fieldName: string; seriesId: string }) {
  const basis = JSON.stringify({
    fieldName: input.fieldName,
    seriesId: input.seriesId,
  })
  return `stats:${createHash('sha256').update(basis).digest('hex')}`
}

function seriesIdentifier(input: {
  datasetCode: string
  referencePeriodCode: string
  sourceFeatureRef: string
}) {
  const basis = JSON.stringify(input)
  return `stats-series:${createHash('sha256').update(basis).digest('hex')}`
}

export function recordIdentifier(input: {
  datasetCode: string
  geography: CanonicalStatsGeography
  referencePeriodCode: string
}) {
  return `stats:${createHash('sha256')
    .update(
      JSON.stringify({
        datasetCode: input.datasetCode,
        referencePeriodCode: input.referencePeriodCode,
        geography: {
          kind: input.geography.kind,
          code: input.geography.code,
          class: input.geography.class ?? null,
          namespace: input.geography.namespace ?? null,
        },
      }),
    )
    .digest('hex')}`
}

/** Identity-only recovery uses retained publisher properties, never recuration. */
export function statisticSourceGeography(input: {
  datasetCode: string
  properties: Record<string, unknown>
  sourceFeatureRef: string
  sourceVersion: string
}) {
  const profile = profileFor(input.datasetCode, input.properties, input.sourceVersion)
  return geographyFor(
    profile.dimensions,
    input.sourceFeatureRef.replace(
      `hkgov-censtatd/${input.datasetCode}/${input.sourceVersion}/`,
      '',
    ),
  )
}

function geographyFor(
  dimensions: Dimension[],
  sourceFeatureRef: string,
): CanonicalStatsGeography {
  // A Building Group row also carries its parent HMA. The mapping dimension is
  // the most specific feature, not its containing Division.
  const geography =
    dimensions.find(dimension => dimension.code === 'building-group') ?? dimensions[0]
  if (!geography) return { code: sourceFeatureRef, kind: 'publisher-feature' }
  const geographyClass = dimensions.find(
    dimension => dimension.code === `${geography.code}-class`,
  )
  const parent =
    geography.code === 'building-group'
      ? dimensions.find(dimension => dimension.code === 'housing-market-area')
      : undefined
  return {
    code: geography.valueCode,
    ...(geographyClass ? { class: geographyClass.valueCode } : {}),
    ...(parent ? { namespace: `${parent.code}:${parent.valueCode}` } : {}),
    kind: geography.code,
  }
}

function literal(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}
