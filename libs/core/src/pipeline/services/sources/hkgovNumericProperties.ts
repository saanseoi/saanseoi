import { retainedPropertyName } from './retainedProperties'

const numericLayers = new Set([
  'BG_21C',
  'HMA_21C',
  'MHE_21C',
  'NewTown_21C',
  'DCD_LQ_Q32023',
  'DC_GHS',
  'Density_2022',
  'Density_2024',
  'AREA_LQ_2023',
])
const subdividedUnitLayers = new Set(['DC_16BC_SDU', 'DC_21C_SDU'])
const sduIntegers = new Set(['dc', 'objectId', 'sduDh', 'sduN', 'sduOq', 'sduPop'])
const textFields = new Set([
  'bg',
  'bgEn',
  'bgZhHant',
  'hma',
  'hmaEn',
  'hmaZhHant',
  'estate',
  'estateEn',
  'estateZhHant',
  'newtown',
  'newtownEn',
  'newtownZhHant',
  'dc',
  'dcEn',
  'dcZhHant',
  'dcClass',
  'areaEn',
  'areaZhHant',
  'year',
  'quarter',
  'period',
])

export function censtatdNumericPropertyKind(layerName: string, name: string) {
  const field = retainedPropertyName(name)
  if (subdividedUnitLayers.has(layerName)) {
    if (sduIntegers.has(field)) return 'integer'
    if (field === 'shapeLength' || field === 'shapeArea') return 'measurement'
    return null
  }
  if (!numericLayers.has(layerName)) return null
  if (textFields.has(field) || /(?:Code|Id)$/.test(field)) return null
  if (field === 'shapeLength' || field === 'shapeArea') return 'measurement'
  return 'number'
}

/** Publisher area/length attributes are independent of geometry coordinates. */
export function normaliseHkgovMeasurement(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(2))
    : undefined
}

const censtatdDatasets = new Set(
  [
    'housing-market-areas-building-groups',
    'major-housing-estates',
    'new-towns',
    'permanent-living-quarters',
    'permanent-living-quarters-district',
    'population-households-district',
    'land-area-population-density-district',
    'subdivided-units-district',
  ].map(name => `ds-hk-hkgov-censtatd-division-statistic-${name}`),
)

/** Annotate observed numeric types; suppression strings keep separate schema branches. */
export function hkgovNumericSourceField(
  datasetCode: string,
  name: string,
  type: string,
  measurementsRounded: boolean,
) {
  const censtatd = censtatdDatasets.has(datasetCode)
  const hyd = datasetCode.startsWith('ds-hk-hkgov-hyd-')
  if ((!censtatd && !hyd) || !['integer', 'number'].includes(type)) return undefined
  if (measurementsRounded && ['shapeArea', 'shapeLength'].includes(name)) {
    return {
      type,
      multipleOf: 0.01,
      description:
        'Publisher measurement in its source coordinate system, rounded to two decimal places. Geometry coordinates retain their full precision.',
    }
  }
  if (!censtatd) return undefined
  return { type }
}
