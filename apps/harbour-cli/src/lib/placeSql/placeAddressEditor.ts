import { isCancel, log, select, text } from '@clack/prompts'
import type {
  ParsedPlaceAddress,
  PlaceAddressDefinition,
} from './placeAddressMatcher.ts'
import type { SupplementaryValues } from './supplementaryPlaceAddress.ts'

export const addressEditorFields = [
  ['buildingNumberFrom', 'BuildingNumberStart'],
  ['buildingNumberTo', 'BuildingNumberEnd'],
  ['buildingName', 'Building'],
  ['blockExpression', 'Block'],
  ['phaseExpression', 'Phase'],
  ['estateName', 'Estate'],
  ['streetName', 'Street'],
] as const

export function safeAddressText(value: string) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: source data cannot inject terminal controls
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
}

export function validateBuildingNumber(value: string | undefined) {
  return value?.trim() && !/^\d+[A-Za-z]?$/u.test(value.trim())
    ? 'Use a number with an optional letter, such as 228 or 228A.'
    : undefined
}

export function formatEditedAddress(value: Partial<PlaceAddressDefinition>) {
  const number = [value.buildingNumberFrom, value.buildingNumberTo]
    .filter(Boolean)
    .join('–')
  const street =
    value.locale === 'zh-hant'
      ? [value.streetName, number ? `${number}號` : null].filter(Boolean).join('')
      : [number, value.streetName].filter(Boolean).join(' ')
  const parts = [
    value.buildingName,
    value.blockExpression,
    value.phaseExpression,
    value.estateName,
    street,
  ]
  return (value.locale === 'zh-hant' ? parts.reverse() : parts)
    .filter(Boolean)
    .join(', ')
}

export function parsedAddressSeed(parsed?: ParsedPlaceAddress): PlaceAddressDefinition {
  return {
    addressId: '',
    locale: 'en',
    formattedAddress: null,
    buildingName: null,
    blockExpression: null,
    phaseExpression: null,
    estateName: null,
    ...Object.fromEntries(
      parsed?.recognised2dComponents.map(value => [value.kind, value.name]) ?? [],
    ),
    buildingNumberFrom: parsed?.buildingNumbers[0] ?? null,
    buildingNumberTo:
      (parsed?.buildingNumbers.length ?? 0) > 1
        ? (parsed?.buildingNumbers.at(-1) ?? null)
        : null,
    buildingNumberExpression: parsed?.buildingNumberExpression ?? null,
    streetName: parsed?.street?.name ?? null,
  }
}

// Only controlled expressions are translated; proper names stay as entered.
function translateComponent(key: string, value: string | null) {
  if (!value) return null
  if (key === 'blockExpression') {
    const match = /^(BLOCK|TOWER)\s+([\dA-Z]+)$/i.exec(value)
    if (match) return `${match[2]}座`
  }
  if (key === 'phaseExpression') {
    const match = /^PHASE\s+(\d+)$/i.exec(value)
    if (match) return `第${match[1]}期`
  }
  return value
}

export function localiseEditedAddress(
  value: SupplementaryValues,
  englishSeed: PlaceAddressDefinition,
  chineseSeed?: PlaceAddressDefinition,
): SupplementaryValues[] {
  const generated: string[] = []
  const chinese: SupplementaryValues = { ...value, locale: 'zh-hant' }
  for (const [key] of addressEditorFields) {
    if (chineseSeed && value[key] === englishSeed[key]) chinese[key] = chineseSeed[key]
    else {
      chinese[key] = translateComponent(key, value[key])
      if (value[key]) generated.push(key)
    }
  }
  chinese.buildingNumberExpression =
    [chinese.buildingNumberFrom, chinese.buildingNumberTo].filter(Boolean).join('–') ||
    null
  chinese.formattedAddress = formatEditedAddress(chinese)
  return [
    {
      ...value,
      provenance: {
        isHumanVerified: addressEditorFields.map(([key]) => key),
        isMachineTranslated: [],
        isLocaleInferred: false,
      },
    },
    {
      ...chinese,
      provenance: {
        isHumanVerified: [],
        isMachineTranslated: [...generated, 'formattedAddress'],
        isLocaleInferred: false,
      },
    },
  ]
}

export async function editPlaceAddress(
  seed: PlaceAddressDefinition,
): Promise<SupplementaryValues | null> {
  const { addressId: _addressId, ...initial } = seed
  const value = {
    ...initial,
    locale: 'en',
    formattedAddress: initial.formattedAddress ?? '',
  }
  while (true) {
    const choice = await select({
      message: 'Address components (English)',
      options: [
        { value: 'save', label: 'Save' },
        ...addressEditorFields.map(([key, label]) => ({
          value: key,
          label: `${label} : ${safeAddressText(value[key] ?? '')}`,
        })),
        { value: 'back', label: 'Back' },
      ],
    })
    if (isCancel(choice) || choice === 'back') return null
    if (choice === 'save') {
      if (
        value.buildingNumberTo &&
        (!value.buildingNumberFrom ||
          value.buildingNumberFrom.localeCompare(value.buildingNumberTo, 'en', {
            numeric: true,
          }) > 0)
      ) {
        log.error('Enter a start number that does not follow the end number.')
        continue
      }
      const changed = addressEditorFields.some(([key]) => value[key] !== seed[key])
      if (changed || !value.formattedAddress) {
        value.buildingNumberExpression =
          [value.buildingNumberFrom, value.buildingNumberTo]
            .filter(Boolean)
            .join('–') || null
        value.formattedAddress = formatEditedAddress(value)
      }
      if (!value.formattedAddress) {
        log.error('Enter at least one address component.')
        continue
      }
      return value
    }
    const field = addressEditorFields.find(([key]) => key === choice)
    if (!field) continue
    const [key, label] = field
    const answer = await text({
      message: label,
      initialValue: safeAddressText(value[key] ?? ''),
      validate:
        key === 'buildingNumberFrom' || key === 'buildingNumberTo'
          ? validateBuildingNumber
          : undefined,
    })
    if (isCancel(answer)) continue
    value[key] = safeAddressText(answer).trim() || null
  }
}
