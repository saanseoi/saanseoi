import { createHash } from 'node:crypto'
import type {
  CenstatdCanonicalDimension,
  CenstatdCanonicalDimensionValue,
  CenstatdCanonicalMeasure,
  CenstatdCanonicalObservation,
} from '@repo/core/pipeline/services/censtatdReleaseStats'
import type {
  CanonicalStatsRecordValue,
  StatsAggregation,
  StatsStatisticKind,
} from '@repo/db'

import type { CenstatdMeasureMetadata } from './censtatdMeasureCuration.ts'

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
  geographyCohortId: string | null
  id: string
  referencePeriodCode: string
  referencePeriodEnd: string | null
  referencePeriodGranularity: string
  referencePeriodStart: string | null
  sourceFeatureId: string
  sourceReleaseId: string
}

type CanonicalSeriesDimension = {
  dimensionCode: string
  seriesId: string
  valueCode: string
}

type CanonicalRecord = CanonicalSeries & {
  dimensions: Record<string, string>
  values: Record<string, CanonicalStatsRecordValue>
}

type CanonicalMeasure = CenstatdCanonicalMeasure & {
  aggregation: StatsAggregation
  datasetCode: string
  denominatorMeasureCode: string | null
  sourceField: string
  sourceNullOption: string | null
  statisticKind: StatsStatisticKind
  valueKind: 'categorical' | 'numeric'
}

type CanonicalDimension = CenstatdCanonicalDimension & {
  datasetCode: string
}

type CanonicalDimensionValue = CenstatdCanonicalDimensionValue & {
  datasetCode: string
}

export type CanonicalStatsRows = {
  dimensions: CanonicalDimension[]
  measures: CanonicalMeasure[]
  measuresI18n: Row[]
  observations: CanonicalObservation[]
  records: CanonicalRecord[]
  series: CanonicalSeries[]
  seriesDimensions: CanonicalSeriesDimension[]
  values: CanonicalDimensionValue[]
  valuesI18n: Row[]
}

export type HkgovCenstatdStatisticSourceRow = {
  datasetCode: string
  divisionId?: string | null
  properties: Record<string, unknown>
  sourceFeatureId: string
  sourceReleaseId: string
  sourceVersion: string
}

/**
 * Converts publisher-native C&SD properties into compact canonical records
 * without guessing semantic labels or discarding source literals. Geometry is
 * deliberately excluded: it remains a source assertion until it is reviewed
 * into the Divisions family.
 */
export function normaliseHkgovCenstatdStatistics(
  input: HkgovCenstatdStatisticSourceRow[],
  options: { measureMetadata?: ReadonlyMap<string, CenstatdMeasureMetadata> } = {},
): CanonicalStatsRows {
  const observations: CanonicalObservation[] = []
  const measures = new Map<string, CanonicalMeasure>()
  const measuresI18n = new Map<string, Row>()
  const dimensions = new Map<string, CanonicalDimension>()
  const values = new Map<string, CanonicalDimensionValue>()
  const valuesI18n = new Map<string, Row>()
  const series = new Map<string, CanonicalSeries>()
  const seriesDimensions = new Map<string, CanonicalSeriesDimension>()
  const recordDimensions = new Map<string, Record<string, string>>()
  const observationsBySeries = new Map<string, CanonicalObservation[]>()

  for (const row of input) {
    const profile = profileFor(row.datasetCode, row.properties, row.sourceVersion)
    const dimensionEntries = profile.dimensions
    const seriesId = seriesIdentifier({
      datasetCode: row.datasetCode,
      referencePeriodCode: profile.referencePeriodCode,
      sourceFeatureId: row.sourceFeatureId,
    })
    series.set(seriesId, {
      datasetCode: row.datasetCode,
      divisionId: row.divisionId ?? null,
      geographyCohortId: profile.geographyCohortId,
      id: seriesId,
      referencePeriodCode: profile.referencePeriodCode,
      referencePeriodEnd: null,
      referencePeriodGranularity: profile.referencePeriodGranularity,
      referencePeriodStart: null,
      sourceFeatureId: row.sourceFeatureId,
      sourceReleaseId: row.sourceReleaseId,
    })
    for (const dimension of dimensionEntries) {
      const key = [row.datasetCode, dimension.code].join('\u0000')
      dimensions.set(key, {
        datasetCode: row.datasetCode,
        dimensionCode: dimension.code,
      })
      const valueKey = [row.datasetCode, dimension.code, dimension.valueCode].join(
        '\u0000',
      )
      values.set(valueKey, {
        datasetCode: row.datasetCode,
        dimensionCode: dimension.code,
        valueCode: dimension.valueCode,
      })
      const seriesDimensionKey = [seriesId, dimension.code, dimension.valueCode].join(
        '\u0000',
      )
      seriesDimensions.set(seriesDimensionKey, {
        dimensionCode: dimension.code,
        seriesId,
        valueCode: dimension.valueCode,
      })
      const recordDimensionValues = recordDimensions.get(seriesId) ?? {}
      recordDimensionValues[dimension.code] = dimension.valueCode
      recordDimensions.set(seriesId, recordDimensionValues)
      if (dimension.nameEn) {
        valuesI18n.set(`${valueKey}\u0000en`, {
          datasetCode: row.datasetCode,
          dimensionCode: dimension.code,
          valueCode: dimension.valueCode,
          locale: 'en',
          name: dimension.nameEn,
        })
      }
      if (dimension.nameZhHant) {
        valuesI18n.set(`${valueKey}\u0000zh-Hant`, {
          datasetCode: row.datasetCode,
          dimensionCode: dimension.code,
          valueCode: dimension.valueCode,
          locale: 'zh-Hant',
          name: dimension.nameZhHant,
        })
      }
    }

    for (const [sourceField, raw] of Object.entries(row.properties)) {
      if (profile.identifierFields.has(sourceField)) continue
      const sourceValue = literal(raw)
      if (sourceValue === null) continue
      const parsed = parseObservationValue(row.datasetCode, sourceField, sourceValue)
      const metadata = options.measureMetadata?.get(
        `${row.datasetCode}\u0000${sourceField}`,
      )
      const measureCode = metadata?.measureCode ?? sourceField
      const observationId = observationIdentifier({
        measureCode,
        seriesId,
      })
      const observation = {
        id: observationId,
        seriesId,
        sourceField,
        referencePeriodCode: profile.referencePeriodCode,
        measureCode,
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
      const measureKey = [row.datasetCode, measureCode].join('\u0000')
      measures.set(measureKey, {
        aggregation: metadata?.aggregation ?? 'unreviewed',
        datasetCode: row.datasetCode,
        denominatorMeasureCode: metadata?.denominatorMeasureCode ?? null,
        measureCode,
        sourceField,
        sourceNullOption: metadata?.sourceNullOption ?? null,
        statisticKind: metadata?.statisticKind ?? 'unreviewed',
        valueKind: parsed.numericValue === null ? 'categorical' : 'numeric',
        unitCode: metadata?.unitCode ?? unitFor(row.datasetCode, sourceField),
      })
      for (const localisation of metadata?.localisations ?? [
        {
          description: null,
          isTranslationVerified: true,
          locale: 'en' as const,
          name: sourceField,
        },
      ]) {
        measuresI18n.set(`${measureKey}\u0000${localisation.locale}`, {
          datasetCode: row.datasetCode,
          measureCode,
          locale: localisation.locale,
          name: localisation.name,
          description: localisation.description,
          isTranslationVerified: localisation.isTranslationVerified,
        })
      }
    }
  }

  const scaledPrecisionByMeasure = new Map<string, number>()
  for (const observation of observations) {
    if (!isPopulationThousands(observation.sourceField, observation.sourceValue))
      continue
    const key = `${observation.sourceField}\u0000${observation.measureCode}`
    scaledPrecisionByMeasure.set(
      key,
      Math.max(
        scaledPrecisionByMeasure.get(key) ?? 0,
        decimalPlaces(observation.sourceValue),
      ),
    )
  }
  for (const observation of observations) {
    const key = `${observation.sourceField}\u0000${observation.measureCode}`
    const decimalCount = scaledPrecisionByMeasure.get(key)
    if (decimalCount !== undefined)
      observation.valuePrecision = precisionAfterScaling(3, decimalCount)
  }

  return {
    dimensions: [...dimensions.values()],
    measures: [...measures.values()],
    measuresI18n: [...measuresI18n.values()],
    observations,
    records: [...series.values()].map(seriesRow => {
      const packedValues: Record<string, CanonicalStatsRecordValue> = {}
      for (const observation of observationsBySeries.get(seriesRow.id) ?? []) {
        if (packedValues[observation.measureCode]) {
          throw new Error(
            `C&SD ${seriesRow.datasetCode} series ${seriesRow.id} has duplicate measure ${observation.measureCode}.`,
          )
        }
        packedValues[observation.measureCode] = {
          numericValue: observation.numericValue,
          observationStatus: observation.observationStatus,
          sourceField: observation.sourceField,
          sourceValue: observation.sourceValue,
          valueCode: observation.valueCode,
          valuePrecision: observation.valuePrecision,
        }
      }
      return {
        ...seriesRow,
        dimensions: recordDimensions.get(seriesRow.id) ?? {},
        values: packedValues,
      }
    }),
    series: [...series.values()],
    seriesDimensions: [...seriesDimensions.values()],
    values: [...values.values()],
    valuesI18n: [...valuesI18n.values()],
  }
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
      return censusProfile(sourceVersion, dimensions, identifierFields)
    case 'ds-hk-hkgov-censtatd-division-statistic-new-towns':
      add('new-town', 'newtown', 'newtown_eng', 'newtown_chi')
      reference('gml_id')
      return censusProfile(sourceVersion, dimensions, identifierFields)
    case 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type':
      add('area', 'AREA_ENG', 'AREA_ENG', 'AREA_CHI')
      reference('PERIOD')
      return {
        dimensions,
        geographyCohortId: null,
        identifierFields,
        referencePeriodCode: sourceVersion,
        referencePeriodGranularity: 'half-year',
      }
    case 'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district':
      add('district', 'DC', 'DC_ENG', 'DC_CHI')
      reference('YEAR')
      reference('QUARTER')
      return {
        dimensions,
        geographyCohortId: null,
        identifierFields,
        referencePeriodCode: sourceVersion,
        referencePeriodGranularity: 'half-year',
      }
    case 'ds-hk-hkgov-censtatd-division-statistic-population-households-district': {
      add('district', 'dc', 'dc_eng', 'dc_chi')
      add('district-class', 'dc_class')
      const year = literal(properties.year)
      if (!year) throw new Error('C&SD Population and Household row has no year.')
      reference('year')
      return {
        dimensions,
        geographyCohortId: null,
        identifierFields,
        referencePeriodCode: year,
        referencePeriodGranularity: 'year',
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
        geographyCohortId: null,
        identifierFields,
        referencePeriodCode: sourceVersion,
        referencePeriodGranularity: 'year',
      }
    default:
      return {
        dimensions,
        geographyCohortId: null,
        identifierFields,
        referencePeriodCode: sourceVersion,
        referencePeriodGranularity: 'unknown',
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
    geographyCohortId: sourceVersion,
    identifierFields,
    referencePeriodCode: sourceVersion,
    referencePeriodGranularity: 'census',
  }
}

function parseObservationValue(
  datasetCode: string,
  sourceField: string,
  sourceValue: string,
) {
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

function observationIdentifier(input: { measureCode: string; seriesId: string }) {
  const basis = JSON.stringify({
    measureCode: input.measureCode,
    seriesId: input.seriesId,
  })
  return `stats:${createHash('sha256').update(basis).digest('hex')}`
}

function seriesIdentifier(input: {
  datasetCode: string
  referencePeriodCode: string
  sourceFeatureId: string
}) {
  const basis = JSON.stringify(input)
  return `stats-series:${createHash('sha256').update(basis).digest('hex')}`
}

function literal(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}
