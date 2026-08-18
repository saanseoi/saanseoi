import { createHash } from 'node:crypto'
import type {
  CenstatdCanonicalDimension,
  CenstatdCanonicalDimensionValue,
  CenstatdCanonicalMeasure,
  CenstatdCanonicalObservation,
} from '@repo/core/pipeline/services/censtatdReleaseStats'

import type { CenstatdMeasureMetadata } from './censtatdMeasureCuration.ts'

type Row = Record<string, unknown>

type CanonicalObservation = CenstatdCanonicalObservation & {
  id: string
  seriesId: string
  sourceField: string
  sourceValue: string
  unitCode: string
  valueCode: string | null
  valuePrecision: number | null
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

type CanonicalMeasure = CenstatdCanonicalMeasure & {
  datasetCode: string
  sourceField: string
  sourceNullOption: string | null
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

/** The period is retained for release statistics but belongs to the series table. */
export function persistedCanonicalObservation(
  observation: CanonicalStatsRows['observations'][number],
) {
  const { referencePeriodCode: _referencePeriodCode, ...row } = observation
  return row
}

/**
 * Converts publisher-native C&SD properties into canonical observations
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
      const measureCode = sourceField
      const metadata = options.measureMetadata?.get(
        `${row.datasetCode}\u0000${sourceField}`,
      )
      const observationId = observationIdentifier({
        measureCode,
        seriesId,
      })
      observations.push({
        id: observationId,
        seriesId,
        sourceField,
        referencePeriodCode: profile.referencePeriodCode,
        measureCode,
        numericValue: parsed.numericValue,
        valueCode: parsed.valueCode,
        unitCode: metadata?.unitCode ?? unitFor(row.datasetCode, sourceField),
        valuePrecision: null,
        observationStatus: parsed.observationStatus,
        sourceValue,
      })
      const measureKey = [row.datasetCode, measureCode].join('\u0000')
      measures.set(measureKey, {
        datasetCode: row.datasetCode,
        measureCode,
        sourceField,
        sourceNullOption: metadata?.sourceNullOption ?? null,
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

  return {
    dimensions: [...dimensions.values()],
    measures: [...measures.values()],
    measuresI18n: [...measuresI18n.values()],
    observations,
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
    case 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups-2021':
      add('housing-market-area', 'hma', 'hma_eng', 'hma_chi')
      if (properties.bg !== undefined) add('building-group', 'bg', 'bg_eng', 'bg_chi')
      if (properties.bg_ind !== undefined) add('building-group-class', 'bg_ind')
      return censusProfile(sourceVersion, dimensions, identifierFields)
    case 'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates-2021':
      add('housing-estate', 'estate', 'estate_eng', 'estate_chi')
      return censusProfile(sourceVersion, dimensions, identifierFields)
    case 'ds-hk-hkgov-censtatd-division-statistic-new-towns-2021':
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
    return {
      numericValue:
        datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' &&
        sourceField === 'MYPOPN_LAND'
          ? decimalTimesOneThousand(sourceValue)
          : sourceValue,
      observationStatus: 'published',
      valueCode: null,
    }
  }
  if (sourceValue === '**') {
    return {
      numericValue: null,
      observationStatus: 'suppressed',
      valueCode: 'suppressed',
    }
  }
  if (['-', 'N.A.', 'NA'].includes(sourceValue)) {
    return {
      numericValue: null,
      observationStatus: 'unavailable',
      valueCode: 'unavailable',
    }
  }
  return { numericValue: null, observationStatus: 'published', valueCode: sourceValue }
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
