const subdividedUnitLayers = new Set(['DC_16BC_SDU', 'DC_21C_SDU'])
const integerFields = new Set([
  'dc',
  'objectid',
  'sdu_dh',
  'sdu_n',
  'sdu_oq',
  'sdu_pop',
])
const measurementFields = new Set(['shape_length', 'shape_area'])

/** Interpret declared SDU numeric attributes without coercing labels or missing values. */
export function normaliseCenstatdProperty(
  layerName: string,
  name: string,
  value: unknown,
): unknown {
  if (!subdividedUnitLayers.has(layerName)) return value
  const field = name.toLowerCase()
  if (!integerFields.has(field) && !measurementFields.has(field)) return value
  if (typeof value !== 'string' && typeof value !== 'number') return value
  // Empty values, suppression markers and XML nil objects retain their meaning.
  if (typeof value === 'string' && !/^[+-]?\d+(?:\.\d+)?$/.test(value)) return value
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error(`C&SD ${layerName}.${name} must be a finite number.`)
  }
  if (integerFields.has(field)) {
    if (!Number.isSafeInteger(numeric)) {
      throw new Error(`C&SD ${layerName}.${name} must be a safe integer.`)
    }
    return numeric
  }
  return Number(numeric.toFixed(2))
}
