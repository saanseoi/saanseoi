export type HkgovAlsPremiseStructure = {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  estateName: string | null
  normalisation: 'none' | 'redundant-building-name' | 'embedded-block'
}

export type HkgovAlsBuildingNameRomanNumeralNormalisation = {
  from: string
  reference: string
  to: string
}

export type HkgovAlsStructuredPremiseNumber = {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  estateName: string | null
}

const ROMAN_NUMERAL_SUFFIX =
  /^(?<stem>.+?)\s+(?<numeral>(?=[MDCLXVI]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))$/i
const ARABIC_NUMERAL_SUFFIX = /^(?<stem>.+?)\s+(?<numeral>[1-9]\d*)$/
const WRITTEN_NUMERAL_SUFFIX =
  /^(?<stem>.+?)\s+(?<numeral>ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)$/i
const ROMAN_NUMERAL =
  /^(?=[MDCLXVI]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/i

/**
 * Finds building-name families which ALS already styles with a Roman-numeral
 * suffix. A family is the name before its final numeral, normalised only for
 * comparison; the supplied name itself remains otherwise unchanged.
 */
export function collectHkgovAlsRomanNumeralBuildingNameFamilies(
  buildingNames: Iterable<string | null | undefined>,
) {
  const families = new Map<string, string>()

  for (const buildingName of buildingNames) {
    const value = clean(buildingName ?? null)
    const match = value?.match(ROMAN_NUMERAL_SUFFIX)
    const stem = match?.groups?.stem
    const numeral = match?.groups?.numeral
    if (value && stem && numeral && isUnambiguousRomanNumeral(numeral)) {
      families.set(normaliseBuildingNameFamily(stem), value)
    }
  }

  return families
}

/**
 * Within a building-name family that ALS has already expressed with Roman
 * numerals, render a trailing Arabic or written building number as its Roman
 * equivalent. This intentionally does not affect numeric names in other families.
 */
export function normaliseHkgovAlsBuildingNameRomanNumeral(input: {
  buildingName: string | null
  romanNumeralFamilies: ReadonlyMap<string, string>
}): HkgovAlsBuildingNameRomanNumeralNormalisation | null {
  const from = clean(input.buildingName)
  const match =
    from?.match(ARABIC_NUMERAL_SUFFIX) ?? from?.match(WRITTEN_NUMERAL_SUFFIX)
  const stem = match?.groups?.stem
  const numeral = match?.groups?.numeral
  if (!from || !stem || !numeral) return null
  if (!input.romanNumeralFamilies.has(normaliseBuildingNameFamily(stem))) {
    return null
  }

  const numericValue = parseNumeral(numeral)
  if (numericValue == null) return null
  if (numericValue > 3999) return null

  const to = `${stem} ${toRomanNumeral(numericValue)}`
  const reference = input.romanNumeralFamilies.get(normaliseBuildingNameFamily(stem))
  return to === from || !reference ? null : { from, reference, to }
}

/**
 * Finds estate- or building-scoped BLOCK, HOUSE and TOWER number families which
 * ALS already styles with Roman numerals. Unscoped structured numbers are not
 * grouped, preventing a style observed at one premise from affecting another.
 */
export function collectHkgovAlsRomanNumeralPremiseNumberFamilies(
  premises: Iterable<HkgovAlsStructuredPremiseNumber>,
) {
  const families = new Map<string, string>()

  for (const premise of premises) {
    const number = clean(premise.blockNumber)
    const family = structuredPremiseNumberFamily(premise)
    if (number && family && isUnambiguousRomanNumeral(number)) {
      families.set(family, `${premise.blockDescriptor?.trim() ?? 'PREMISE'} ${number}`)
    }
  }

  return families
}

/**
 * Within a Roman-styled BLOCK, HOUSE or TOWER family, render a plain Arabic or
 * written number as Roman numerals.
 */
export function normaliseHkgovAlsPremiseNumberRomanNumeral(input: {
  premise: HkgovAlsStructuredPremiseNumber
  romanNumeralFamilies: ReadonlyMap<string, string>
}): HkgovAlsBuildingNameRomanNumeralNormalisation | null {
  const from = clean(input.premise.blockNumber)
  const family = structuredPremiseNumberFamily(input.premise)
  const reference = family ? input.romanNumeralFamilies.get(family) : null
  if (!from || !family || !reference) return null
  const numericValue = parseNumeral(from)
  if (numericValue == null) return null
  if (numericValue > 3999) return null

  return { from, reference, to: toRomanNumeral(numericValue) }
}

/**
 * Prefer the English canonical component whenever ALS supplied an English source
 * component. This prevents a deliberately removed duplicate English building name
 * from being replaced by a different Chinese building-name representation.
 */
export function preferHkgovAlsEnglishCanonicalValue(input: {
  canonicalEnglish: string | null
  canonicalChinese: string | null
  rawEnglish: string | null
}) {
  return clean(input.rawEnglish) ? input.canonicalEnglish : input.canonicalChinese
}

/**
 * Normalise the narrowly-defined ALS convention where an estate's block, house or
 * tower has been put in BuildingName rather than the structured block fields.
 *
 * This deliberately requires an exact estate prefix and a single trailing token.
 * A free-form building name (for example "WEST GATE TOWER") is never parsed.
 */
export function normaliseHkgovAlsPremiseStructure(input: {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  estateName: string | null
}): HkgovAlsPremiseStructure {
  const buildingName = clean(input.buildingName)
  const estateName = clean(input.estateName)
  const blockDescriptor = canonicalHkgovAlsBlockDescriptor(clean(input.blockDescriptor))
  const blockNumber = clean(input.blockNumber)

  if (!buildingName || !estateName) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalisation: 'none',
    }
  }

  if (sameName(buildingName, estateName)) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName: null,
      estateName,
      normalisation: 'redundant-building-name',
    }
  }

  const escapedEstate = escapeRegExp(estateName).replace(/\\ /g, '\\s+')
  const match = new RegExp(
    `^${escapedEstate}\\s+(BLOCK|BLK|HOUSE|TOWER)\\s+([A-Z0-9][A-Z0-9 ./-]*)$`,
    'i',
  ).exec(buildingName)
  if (!match) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalisation: 'none',
    }
  }

  const parsedDescriptor = canonicalHkgovAlsBlockDescriptor(match[1] ?? null)
  const parsedNumber = clean(match[2] ?? null)
  if (!parsedDescriptor || !parsedNumber) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalisation: 'none',
    }
  }

  // Never overwrite a disagreeing structured value. It is a source conflict which
  // needs review rather than a presentation normalisation.
  if (
    (blockDescriptor && blockDescriptor !== parsedDescriptor) ||
    (blockNumber && !sameName(blockNumber, parsedNumber))
  ) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalisation: 'none',
    }
  }

  return {
    blockDescriptor: parsedDescriptor,
    blockNumber: parsedNumber,
    buildingName: null,
    estateName,
    normalisation: 'embedded-block',
  }
}

export function canonicalHkgovAlsBlockDescriptor(value: string | null) {
  if (!value) return null
  const key = value.toUpperCase().replace(/\.$/, '')
  if (key === 'BLOCK' || key === 'BLK') return 'BLK'
  if (key === 'HOUSE') return 'HOUSE'
  if (key === 'TOWER') return 'TOWER'
  return value
}

function clean(value: string | null) {
  const text = value?.trim().replace(/\s+/g, ' ')
  return text || null
}

function normaliseBuildingNameFamily(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
}

function structuredPremiseNumberFamily(input: HkgovAlsStructuredPremiseNumber) {
  const descriptor = canonicalHkgovAlsBlockDescriptor(clean(input.blockDescriptor))
  if (descriptor !== 'BLK' && descriptor !== 'HOUSE' && descriptor !== 'TOWER') {
    return null
  }

  const context = clean(input.estateName) ?? clean(input.buildingName)
  return context ? `${descriptor}\u0000${normaliseBuildingNameFamily(context)}` : null
}

function isUnambiguousRomanNumeral(value: string) {
  // Single-letter Roman numerals overlap with common Hong Kong block labels such
  // as A–E. Require at least two characters (II, IV, IX, ...) as actual style
  // evidence before normalising a family.
  return value.length > 1 && ROMAN_NUMERAL.test(value)
}

function parseNumeral(value: string) {
  if (/^[1-9]\d*$/.test(value)) return Number(value)
  const writtenNumerals: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
    SIX: 6,
    SEVEN: 7,
    EIGHT: 8,
    NINE: 9,
    TEN: 10,
  }
  return writtenNumerals[value.toUpperCase()] ?? null
}

function toRomanNumeral(value: number) {
  const numerals: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let remaining = value
  let result = ''

  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral
      remaining -= amount
    }
  }

  return result
}

function sameName(left: string, right: string) {
  return left.toUpperCase() === right.toUpperCase()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
