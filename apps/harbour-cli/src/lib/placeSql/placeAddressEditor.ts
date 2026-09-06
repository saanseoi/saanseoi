import { isCancel, text } from '@clack/prompts'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import type { SupplementaryValues } from './supplementaryPlaceAddress.ts'

const fields = [
  ['buildingName', 'Building name'],
  ['estateName', 'Estate name'],
  ['blockExpression', 'Block'],
  ['phaseExpression', 'Phase'],
  ['buildingNumberFrom', 'Building number start'],
  ['buildingNumberTo', 'Building number end (blank for a single number)'],
  ['streetName', 'Street name'],
] as const

export function validateBuildingNumber(value: string | undefined) {
  return value?.trim() && !/^\d+[A-Za-z]?$/u.test(value.trim())
    ? 'Use a number with an optional letter, such as 228 or 228A.'
    : undefined
}

export async function editPlaceAddress(
  seed: PlaceAddressDefinition,
): Promise<SupplementaryValues | null> {
  const { addressId: _addressId, ...value } = seed
  for (const [key, label] of fields) {
    const answer = await text({
      message: label,
      initialValue: value[key] ?? '',
      validate: answer => {
        if (key !== 'buildingNumberFrom' && key !== 'buildingNumberTo') return
        const invalid = validateBuildingNumber(answer)
        if (invalid) return invalid
        if (key === 'buildingNumberTo' && answer?.trim()) {
          if (!value.buildingNumberFrom)
            return 'Clear the end number or go back and enter a start number.'
          if (
            value.buildingNumberFrom.localeCompare(answer.trim(), 'en', {
              numeric: true,
            }) > 0
          )
            return 'The ending building number must not precede the start.'
        }
      },
    })
    if (isCancel(answer)) return null
    value[key] = answer.trim() || null
  }
  if (value.buildingNumberTo && !value.buildingNumberFrom) {
    throw new Error('An address range requires a starting building number.')
  }
  if (
    value.buildingNumberFrom &&
    value.buildingNumberTo &&
    value.buildingNumberFrom.localeCompare(value.buildingNumberTo, 'en', {
      numeric: true,
    }) > 0
  )
    throw new Error('The ending building number must not precede the start.')
  value.buildingNumberExpression =
    [value.buildingNumberFrom, value.buildingNumberTo].filter(Boolean).join('–') || null
  const suggested = [
    value.buildingName,
    value.estateName,
    value.blockExpression,
    value.phaseExpression,
    [value.buildingNumberExpression, value.streetName].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')
  const formatted = await text({
    message: 'Formatted address (confirm it agrees with the edited components)',
    initialValue: suggested,
    validate: answer =>
      !answer?.trim() ? 'A formatted address is required.' : undefined,
  })
  if (isCancel(formatted)) return null
  return { ...value, formattedAddress: formatted.trim() }
}
