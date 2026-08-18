import { createHash } from 'node:crypto'

type Row = Record<string, unknown>

export type CanonicalStatsRows = {
  dimensions: Row[]
  measures: Row[]
  measuresI18n: Row[]
  observationDimensions: Row[]
  observations: Row[]
  values: Row[]
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
 * Converts publisher-native C&SD properties into canonical observations
 * without guessing semantic labels or discarding source literals. Geometry is
 * deliberately excluded: it remains a source assertion until it is reviewed
 * into the Divisions family.
 */
export function normaliseHkgovCenstatdStatistics(
  input: HkgovCenstatdStatisticSourceRow[],
): CanonicalStatsRows {
  const observations: Row[] = []
  const measures = new Map<string, Row>()
  const measuresI18n = new Map<string, Row>()
  const dimensions = new Map<string, Row>()
  const values = new Map<string, Row>()
  const valuesI18n = new Map<string, Row>()
  const observationDimensions: Row[] = []

  for (const row of input) {
    const profile = profileFor(row.datasetCode, row.properties, row.sourceVersion)
    const dimensionEntries = profile.dimensions
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
      const parsed = parseObservationValue(sourceValue)
      const measureCode = sourceField
      const observationId = observationIdentifier({
        datasetCode: row.datasetCode,
        dimensions: dimensionEntries,
        measureCode,
        referencePeriodCode: profile.referencePeriodCode,
      })
      observations.push({
        id: observationId,
        datasetCode: row.datasetCode,
        sourceReleaseId: row.sourceReleaseId,
        sourceFeatureId: row.sourceFeatureId,
        sourceField,
        divisionId: row.divisionId ?? null,
        referencePeriodCode: profile.referencePeriodCode,
        referencePeriodStart: null,
        referencePeriodEnd: null,
        referencePeriodGranularity: profile.referencePeriodGranularity,
        measureCode,
        numericValue: parsed.numericValue,
        valueCode: parsed.valueCode,
        unitCode: unitFor(row.datasetCode, sourceField),
        valuePrecision: null,
        observationStatus: parsed.observationStatus,
        sourceValue,
        geographyCohortId: profile.geographyCohortId,
      })
      const measureKey = [row.datasetCode, measureCode].join('\u0000')
      measures.set(measureKey, {
        datasetCode: row.datasetCode,
        measureCode,
        sourceField,
        valueKind: parsed.numericValue === null ? 'categorical' : 'numeric',
        unitCode: unitFor(row.datasetCode, sourceField),
      })
      measuresI18n.set(`${measureKey}\u0000en`, {
        datasetCode: row.datasetCode,
        measureCode,
        locale: 'en',
        // Until a reviewed upstream definition is attached, do not invent a
        // friendlier label than the publisher's exact field code.
        name: sourceField,
        description: null,
      })
      for (const dimension of dimensionEntries) {
        observationDimensions.push({
          observationId,
          dimensionCode: dimension.code,
          valueCode: dimension.valueCode,
        })
      }
    }
  }

  return {
    dimensions: [...dimensions.values()],
    measures: [...measures.values()],
    measuresI18n: [...measuresI18n.values()],
    observationDimensions,
    observations,
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

function parseObservationValue(sourceValue: string) {
  if (/^[+-]?\d+(?:\.\d+)?$/.test(sourceValue)) {
    return {
      numericValue: sourceValue,
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

function observationIdentifier(input: {
  datasetCode: string
  dimensions: Dimension[]
  measureCode: string
  referencePeriodCode: string
}) {
  const basis = JSON.stringify({
    datasetCode: input.datasetCode,
    dimensions: input.dimensions
      .map(value => [value.code, value.valueCode])
      .sort(([left], [right]) => left.localeCompare(right)),
    measureCode: input.measureCode,
    referencePeriodCode: input.referencePeriodCode,
  })
  return `stats:${createHash('sha256').update(basis).digest('hex')}`
}

function literal(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}
