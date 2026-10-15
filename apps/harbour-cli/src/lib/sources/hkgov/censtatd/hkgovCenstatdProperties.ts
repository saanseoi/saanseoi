import {
  censtatdNumericPropertyKind,
  normaliseHkgovMeasurement,
} from '@repo/core/pipeline/services/sources/hkgovNumericProperties.ts'

/** Interpret numeric measures in the supported native C&SD layers. */
export function normaliseCenstatdProperty(
  layerName: string,
  name: string,
  value: unknown,
): unknown {
  const kind = censtatdNumericPropertyKind(layerName, name)
  if (!kind) return value
  if (typeof value !== 'string' && typeof value !== 'number') return value
  // Empty values, suppression markers and XML nil objects retain their meaning.
  if (
    typeof value === 'string' &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
  )
    return value
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error(`C&SD ${layerName}.${name} must be a finite number.`)
  }
  if (kind === 'integer' || Number.isInteger(numeric)) {
    if (!Number.isSafeInteger(numeric)) {
      throw new Error(`C&SD ${layerName}.${name} must be a safe integer.`)
    }
    return numeric
  }
  return kind === 'measurement' ? normaliseHkgovMeasurement(numeric) : numeric
}
