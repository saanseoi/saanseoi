export type HkgovAlsPremiseStructure = {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  estateName: string | null
  normalization: 'none' | 'redundant-building-name' | 'embedded-block'
}

export type HkgovAlsBuildingNameRomanNumeralNormalization = {
  from: string
  to: string
}

const ROMAN_NUMERAL_SUFFIX =
  /^(?<stem>.+?)\s+(?<numeral>(?=[MDCLXVI]+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))$/i
const ARABIC_NUMERAL_SUFFIX = /^(?<stem>.+?)\s+(?<numeral>[1-9]\d*)$/

/**
 * Finds building-name families which ALS already styles with a Roman-numeral
 * suffix. A family is the name before its final numeral, normalized only for
 * comparison; the supplied name itself remains otherwise unchanged.
 */
export function collectHkgovAlsRomanNumeralBuildingNameFamilies(
  buildingNames: Iterable<string | null | undefined>,
) {
  const families = new Set<string>()

  for (const buildingName of buildingNames) {
    const match = buildingName?.trim().match(ROMAN_NUMERAL_SUFFIX)
    const stem = match?.groups?.stem
    if (stem) families.add(normalizeBuildingNameFamily(stem))
  }

  return families
}

/**
 * Within a building-name family that ALS has already expressed with Roman
 * numerals, render a trailing Arabic building number as its Roman equivalent.
 * This intentionally does not affect numeric names in other families.
 */
export function normalizeHkgovAlsBuildingNameRomanNumeral(input: {
  buildingName: string | null
  romanNumeralFamilies: ReadonlySet<string>
}): HkgovAlsBuildingNameRomanNumeralNormalization | null {
  const from = clean(input.buildingName)
  const match = from?.match(ARABIC_NUMERAL_SUFFIX)
  const stem = match?.groups?.stem
  const numeral = match?.groups?.numeral
  if (!from || !stem || !numeral) return null
  if (!input.romanNumeralFamilies.has(normalizeBuildingNameFamily(stem))) {
    return null
  }

  const numericValue = Number(numeral)
  if (numericValue > 3999) return null

  const to = `${stem} ${toRomanNumeral(numericValue)}`
  return to === from ? null : { from, to }
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
export function normalizeHkgovAlsPremiseStructure(input: {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  estateName: string | null
}): HkgovAlsPremiseStructure {
  const buildingName = clean(input.buildingName)
  const estateName = clean(input.estateName)
  const blockDescriptor = canonicalBlockDescriptor(clean(input.blockDescriptor))
  const blockNumber = clean(input.blockNumber)

  if (!buildingName || !estateName) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalization: 'none',
    }
  }

  if (sameName(buildingName, estateName)) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName: null,
      estateName,
      normalization: 'redundant-building-name',
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
      normalization: 'none',
    }
  }

  const parsedDescriptor = canonicalBlockDescriptor(match[1] ?? null)
  const parsedNumber = clean(match[2] ?? null)
  if (!parsedDescriptor || !parsedNumber) {
    return {
      blockDescriptor,
      blockNumber,
      buildingName,
      estateName,
      normalization: 'none',
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
      normalization: 'none',
    }
  }

  return {
    blockDescriptor: parsedDescriptor,
    blockNumber: parsedNumber,
    buildingName: null,
    estateName,
    normalization: 'embedded-block',
  }
}

function canonicalBlockDescriptor(value: string | null) {
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

function normalizeBuildingNameFamily(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
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
