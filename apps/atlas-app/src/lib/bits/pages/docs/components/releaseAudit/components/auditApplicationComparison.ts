import type { IndividualAudit, Json } from '@repo/core/provenance'

/** Presentation follows available evidence, independently of the active list filter. */
export function auditApplicationComparison(
  row: IndividualAudit,
): { input: Json; output: Json } | null {
  const context = row.context
  const inputKey = Object.hasOwn(context, 'expected') ? 'expected' : 'input'
  const outputKey = Object.hasOwn(context, 'replacement') ? 'replacement' : 'output'
  if (
    row.review?.kind !== 'patch' &&
    !(Object.hasOwn(context, inputKey) && Object.hasOwn(context, outputKey))
  )
    return null
  let input = context[inputKey] ?? null
  const output = context[outputKey] ?? null
  if (
    row.operation === 'overture_hong_kong_area_geometry_restored' &&
    output &&
    typeof output === 'object' &&
    !Array.isArray(output) &&
    typeof output.id === 'string' &&
    !output.id.endsWith(':new-territories') &&
    input &&
    typeof input === 'object' &&
    !Array.isArray(input)
  ) {
    const { exclusionArea: _exclusionArea, ...districts } = input
    input = districts
  }
  return { input, output }
}
