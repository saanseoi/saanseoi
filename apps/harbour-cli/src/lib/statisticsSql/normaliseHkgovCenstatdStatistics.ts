import { createHash } from 'node:crypto'
import type {
  CenstatdCanonicalDimension,
  CenstatdCanonicalDimensionValue,
  CenstatdCanonicalField,
  CenstatdCanonicalObservation,
} from '@repo/core/pipeline/services/censtatdReleaseStats'
import type {
  CanonicalStatsGeography,
  StatsAggregation,
  StatsFieldComparability,
  StatsPeriodicity,
  StatsStatisticKind,
} from '@repo/db'
import { parseStatisticsReferencePeriod } from '@repo/core/pipeline/services/statisticsReferencePeriod'

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
  dimensions: Record<string, string>
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
  dimensions: CanonicalDimension[]
  fields: CanonicalField[]
  fieldsI18n: Row[]
  measures: CanonicalMeasure[]
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
export function normaliseHkgovCenstatdStatistics(
  input: HkgovCenstatdStatisticSourceRow[],
  options: {
    fieldMetadata?: ReadonlyMap<string, CenstatdFieldMetadata>
    measureMetadata?: ReadonlyMap<string, CenstatdMeasureMetadata>
  } = {},
): CanonicalStatsRows {
  const observations: CanonicalObservation[] = []
  const fields = new Map<string, CanonicalField>()
  const fieldsI18n = new Map<string, Row>()
  const measures = new Map<string, CanonicalMeasure>()
  const measuresI18n = new Map<string, Row>()
  const series = new Map<string, CanonicalSeries>()
  const observationsBySeries = new Map<string, CanonicalObservation[]>()

  for (const row of input) {
    const profile = profileFor(row.datasetCode, row.properties, row.sourceVersion)
    const referencePeriod = parseStatisticsReferencePeriod(profile.referencePeriodCode)
    const seriesId = seriesIdentifier({
      datasetCode: row.datasetCode,
      referencePeriodCode: profile.referencePeriodCode,
      sourceFeatureRef: row.sourceFeatureRef,
    })
    const geography = withAreaCompanion(
      row.geography ?? geographyFor(profile.dimensions, row.sourceFeatureRef),
      row.areaCompanionByReferencePeriod,
      referencePeriod.endYear,
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
      const metadata = options.fieldMetadata?.get(
        `${row.datasetCode}\u0000${sourceField}`,
      )
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
      fields.set(fieldKey, {
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
        valueKind: parsed.numericValue === null ? 'categorical' : 'numeric',
        unitCode: metadata?.unitCode ?? unitFor(row.datasetCode, sourceField),
      })
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
          locale: localisation.locale,
          name: localisation.name,
          description: localisation.description,
          isTranslationVerified: localisation.isTranslationVerified,
        })
      }
      const measureKey = `${row.datasetCode}\u0000${measureCode}`
      measures.set(measureKey, { datasetCode: row.datasetCode, measureCode })
      const reviewedMeasure = options.measureMetadata?.get(measureKey)
      if (metadata && options.measureMetadata && !reviewedMeasure) {
        throw new Error(
          `C&SD ${row.datasetCode} field ${fieldName} references unregistered measure ${measureCode}.`,
        )
      }
      const measureLocalisations = reviewedMeasure?.localisations ?? fieldLocalisations
      for (const localisation of measureLocalisations) {
        const key = `${measureKey}\u0000${localisation.locale}`
        const next = {
          datasetCode: row.datasetCode,
          measureCode,
          locale: localisation.locale,
          name: localisation.name,
          description: localisation.description,
          isTranslationVerified: localisation.isTranslationVerified,
        }
        const existing = measuresI18n.get(key)
        if (existing && JSON.stringify(existing) !== JSON.stringify(next)) {
          throw new Error(
            `C&SD ${row.datasetCode} measure ${measureCode} has conflicting localisations.`,
          )
        }
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
      observation.valuePrecision = precisionAfterScaling(3, decimalCount)
  }

  return {
    dimensions: [],
    fields: [...fields.values()],
    fieldsI18n: [...fieldsI18n.values()],
    measures: [...measures.values()],
    measuresI18n: [...measuresI18n.values()],
    observations,
    records: [...series.values()].flatMap(seriesRow => {
      const recordsByDimensions = new Map<string, CanonicalRecord>()
      for (const observation of observationsBySeries.get(seriesRow.id) ?? []) {
        const field = fields.get(
          `${seriesRow.datasetCode}\u0000${observation.fieldName}`,
        )
        const dimensions = field?.dimensions ?? {}
        const id = recordIdentifier({
          dimensions,
          referencePeriodCode: seriesRow.referencePeriodCode,
          sourceFeatureRef: seriesRow.sourceFeatureRef,
        })
        const record = recordsByDimensions.get(id) ?? {
          ...seriesRow,
          dimensions,
          id,
          values: {},
        }
        if (record.values[observation.fieldName]) {
          throw new Error(
            `C&SD ${seriesRow.datasetCode} record ${record.id} has duplicate field ${observation.fieldName}.`,
          )
        }
        record.values[observation.fieldName] =
          observation.numericValue ?? observation.valueCode ?? observation.sourceValue
        recordsByDimensions.set(id, record)
      }
      return [...recordsByDimensions.values()]
    }),
    values: [],
    valuesI18n: [],
  }
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
        ? decimalTimesOneThousand(sourceValue)
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
  return sourceField === 'MYPOPN_LAND' && /^[+-]?\d+(?:\.\d+)?$/.test(sourceValue)
}

function decimalTimesOneThousand(value: string) {
  const [whole, fraction = ''] = value.split('.')
  const padded = `${fraction}000`.slice(0, 3)
  const combined = `${whole}${padded}`.replace(/^(-?)0+(?=\d)/, '$1')
  return combined || '0'
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

function recordIdentifier(input: {
  dimensions: Record<string, string>
  referencePeriodCode: string
  sourceFeatureRef: string
}) {
  const dimensions = Object.fromEntries(
    Object.entries(input.dimensions).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
  return `stats:${createHash('sha256')
    .update(
      JSON.stringify({
        dimensions,
        referencePeriodCode: input.referencePeriodCode,
        sourceFeatureRef: input.sourceFeatureRef,
      }),
    )
    .digest('hex')}`
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
  return {
    code: geography.valueCode,
    ...(geographyClass ? { class: geographyClass.valueCode } : {}),
    kind: geography.code,
  }
}

function literal(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}
