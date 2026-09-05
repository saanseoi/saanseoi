export type PlaceAddressDefinition = {
  addressId: string
  locale: string
  formattedAddress: string | null
  buildingName: string | null
  buildingNumberExpression: string | null
  buildingNumberFrom: string | null
  buildingNumberTo: string | null
  blockExpression: string | null
  phaseExpression: string | null
  estateName: string | null
  streetName: string | null
}

export type PlaceStreetDefinition = {
  locale: string
  name: string
  streetId: string
}

export type ParsedAddress3dPart =
  | {
      floorExpression: string
      floorRef: string | null
      floorType:
        | 'floor'
        | 'ground_floor'
        | 'upper_ground_floor'
        | 'lower_ground_floor'
        | 'basement'
        | 'mezzanine'
        | 'concourse'
        | 'podium'
        | 'roof'
        | 'other'
      kind: 'floor'
      sourceText: string
    }
  | {
      kind: 'unit'
      sourceText: string
      unitExpression: string
      unitRef: string | null
      unitType:
        | 'flat'
        | 'room'
        | 'shop'
        | 'suite'
        | 'unit'
        | 'stall'
        | 'kiosk'
        | 'office'
        | 'other'
    }

export type ParsedPlaceAddress = {
  address2dText: string
  address3dParts: ParsedAddress3dPart[]
  buildingNumberExpression: string | null
  buildingNumbers: string[]
  disposition: 'premise-candidate' | 'street-only' | 'unrecognised'
  normalisedAddress2dText: string
  street: {
    locale: SupportedLocale
    name: string
    normalisedName: string
    streetIds: string[]
  } | null
  unclassified2dText: string | null
}

type SupportedLocale = 'en' | 'zh-hant'

type PreparedAddressDefinition = PlaceAddressDefinition & {
  buildingNumbers: string[]
  locale: SupportedLocale
  normalisedBuildingName: string | null
  normalisedEstateName: string | null
  normalisedFormattedAddress: string | null
  normalisedStreetName: string
}

type PreparedStreetDefinition = {
  locale: SupportedLocale
  name: string
  normalisedName: string
  streetIds: string[]
}

export type PlaceAddressMatcher = {
  byBuildingNumberAndStreet: Map<string, PreparedAddressDefinition[]>
  byExactText: Map<string, Set<string>>
  streetsByLongestName: PreparedStreetDefinition[]
}

const ENGLISH_ADDRESS_ABBREVIATIONS = new Map([
  ['AVE', 'AVENUE'],
  ['BLVD', 'BOULEVARD'],
  ['CRES', 'CRESCENT'],
  ['DR', 'DRIVE'],
  ['HWY', 'HIGHWAY'],
  ['LN', 'LANE'],
  ['PL', 'PLACE'],
  ['RD', 'ROAD'],
  ['ST', 'STREET'],
  ['TER', 'TERRACE'],
])

/**
 * Builds an in-memory index over the selected ALS address snapshot. Only English and
 * Traditional Chinese definitions participate: these are the two authoritative
 * source definitions currently supplied by ALS.
 */
export function createPlaceAddressMatcher(
  definitions: PlaceAddressDefinition[],
  streetDefinitions: PlaceStreetDefinition[] = [],
): PlaceAddressMatcher {
  const byBuildingNumberAndStreet = new Map<string, PreparedAddressDefinition[]>()
  const byExactText = new Map<string, Set<string>>()
  const streetsByKey = new Map<string, PreparedStreetDefinition>()

  for (const definition of definitions) {
    const locale = normaliseDefinitionLocale(definition.locale)
    const streetName = text(definition.streetName)
    if (!locale || !streetName) continue
    addPreparedStreet(streetsByKey, {
      locale,
      name: streetName,
      normalisedName: normaliseAddressText(streetName),
      streetIds: [],
    })
    const buildingNumbers = definitionBuildingNumbers(definition)
    if (buildingNumbers.length === 0) continue

    const prepared: PreparedAddressDefinition = {
      ...definition,
      buildingNumbers,
      locale,
      normalisedBuildingName: normaliseOptional(definition.buildingName),
      normalisedEstateName: normaliseOptional(definition.estateName),
      normalisedFormattedAddress: normaliseOptional(definition.formattedAddress),
      normalisedStreetName: normaliseAddressText(streetName),
    }
    for (const buildingNumber of buildingNumbers) {
      const key = addressComponentKey(buildingNumber, prepared.normalisedStreetName)
      const definitionsForComponent = byBuildingNumberAndStreet.get(key) ?? []
      definitionsForComponent.push(prepared)
      byBuildingNumberAndStreet.set(key, definitionsForComponent)
    }

    if (prepared.normalisedFormattedAddress) {
      const ids = byExactText.get(prepared.normalisedFormattedAddress) ?? new Set()
      ids.add(prepared.addressId)
      byExactText.set(prepared.normalisedFormattedAddress, ids)
    }
  }

  for (const definition of streetDefinitions) {
    const locale = normaliseDefinitionLocale(definition.locale)
    const name = text(definition.name)
    if (!locale || !name) continue
    addPreparedStreet(streetsByKey, {
      locale,
      name,
      normalisedName: normaliseAddressText(name),
      streetIds: [definition.streetId],
    })
  }

  return {
    byBuildingNumberAndStreet,
    byExactText,
    streetsByLongestName: [...streetsByKey.values()].sort(
      (left, right) => right.normalisedName.length - left.normalisedName.length,
    ),
  }
}

/**
 * Resolves a publisher address only when one canonical 2D premise wins. Ambiguous
 * building-number/street combinations deliberately remain unmatched.
 */
export function matchPlaceAddressTexts(
  sourceTexts: string[],
  matcher: PlaceAddressMatcher,
): string | null {
  const matches = sourceTexts.flatMap(sourceText =>
    matchParsedPlaceAddress(parsePlaceAddress(sourceText, matcher), matcher),
  )
  if (matches.length === 0) return null

  const bestScore = Math.max(...matches.map(match => match.score))
  const bestAddressIds = new Set(
    matches.filter(match => match.score === bestScore).map(match => match.addressId),
  )
  return bestAddressIds.size === 1
    ? (bestAddressIds.values().next().value ?? null)
    : null
}

/**
 * Separates typed 3D fragments, then recognises a 2D street and its adjacent building
 * number. Text which is not supported by those components remains visible instead of
 * being guessed to be a building, estate, venue or locality.
 */
export function parsePlaceAddress(
  sourceText: string,
  matcher?: Pick<PlaceAddressMatcher, 'streetsByLongestName'>,
): ParsedPlaceAddress {
  const stripped = stripAddress3d(normaliseChineseNumbers(sourceText.normalize('NFKC')))
  let address2dText = stripped.address2dText
  address2dText = address2dText
    .replaceAll(/\s*,\s*,+/g, ',')
    .replaceAll(/^[\s,;/-]+|[\s,;/-]+$/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
  const normalisedAddress2dText = normaliseAddressText(address2dText)
  const streetMatch = findStreetMatch(
    normalisedAddress2dText,
    matcher?.streetsByLongestName ?? [],
  )
  const buildingNumberMatch = streetMatch
    ? findBuildingNumberBesideStreet(normalisedAddress2dText, streetMatch)
    : null
  const buildingNumberExpression = buildingNumberMatch?.expression ?? null
  const buildingNumbers = buildingNumberExpression
    ? expandSourceBuildingNumberExpression(buildingNumberExpression)
    : []
  const unclassified2dText = removeRecognised2dComponents(
    normalisedAddress2dText,
    streetMatch,
    buildingNumberMatch,
  )
  return {
    address2dText,
    address3dParts: stripped.address3dParts,
    buildingNumberExpression,
    buildingNumbers,
    disposition: streetMatch
      ? buildingNumberExpression
        ? 'premise-candidate'
        : 'street-only'
      : 'unrecognised',
    normalisedAddress2dText,
    street: streetMatch
      ? {
          locale: streetMatch.street.locale,
          name: streetMatch.street.name,
          normalisedName: streetMatch.street.normalisedName,
          streetIds: streetMatch.street.streetIds,
        }
      : null,
    unclassified2dText,
  }
}

function addPreparedStreet(
  streetsByKey: Map<string, PreparedStreetDefinition>,
  street: PreparedStreetDefinition,
) {
  const key = `${street.locale}\0${street.normalisedName}`
  const existing = streetsByKey.get(key)
  if (!existing) {
    streetsByKey.set(key, street)
    return
  }
  existing.streetIds = [...new Set([...existing.streetIds, ...street.streetIds])].sort()
}

function stripAddress3d(value: string) {
  const address3dParts: ParsedAddress3dPart[] = []
  let address2dText = value

  address2dText = address2dText.replace(
    /(\d+)\s*(樓|層)(?:\s*([A-Z]?\d+[A-Z]*(?:[-–][A-Z0-9]+)*)(?:號)?(室|舖|鋪))?/giu,
    (
      sourceText,
      floorRef: string,
      _floorSuffix: string,
      unitRef?: string,
      unitSuffix?: string,
    ) => {
      const floorExpression = `${floorRef}${_floorSuffix}`
      address3dParts.push({
        floorExpression,
        floorRef,
        floorType: 'floor',
        kind: 'floor',
        sourceText: floorExpression,
      })
      if (unitRef) {
        const unitExpression = `${unitRef}${unitSuffix ?? ''}`
        address3dParts.push({
          kind: 'unit',
          sourceText: unitExpression,
          unitExpression,
          unitRef: unitRef.toLocaleUpperCase('en'),
          unitType: chineseUnitType(unitSuffix),
        })
      }
      return ' '
    },
  )
  address2dText = address2dText.replace(/(?:地庫|地下|平台|閣樓)/gu, sourceText => {
    address3dParts.push({
      floorExpression: sourceText,
      floorRef: null,
      floorType: chineseFloorType(sourceText),
      kind: 'floor',
      sourceText,
    })
    return ' '
  })
  address2dText = address2dText.replace(
    /([A-Z]?\d+[A-Z]*(?:[-–][A-Z0-9]+)*)(?:號)?(室|舖|鋪)/giu,
    (sourceText, unitRef: string, suffix: string) => {
      address3dParts.push({
        kind: 'unit',
        sourceText: sourceText.trim(),
        unitExpression: sourceText.trim(),
        unitRef: unitRef.toLocaleUpperCase('en'),
        unitType: chineseUnitType(suffix),
      })
      return ' '
    },
  )
  address2dText = address2dText.replace(
    /\b(shop|unit|room|rm|flat|suite|stall|kiosk|office|counter)\s+(?:no\.?\s*)?([a-z0-9]+(?:\s*(?:-|&|\/|and)\s*[a-z0-9]+)*)\b/giu,
    (sourceText, descriptor: string, unitRef: string) => {
      address3dParts.push({
        kind: 'unit',
        sourceText: sourceText.trim(),
        unitExpression: sourceText.trim(),
        unitRef: normaliseAddressReference(unitRef),
        unitType: englishUnitType(descriptor),
      })
      return ' '
    },
  )
  address2dText = address2dText.replace(
    /\b([BGLUP]?\d*|\d+)\s*\/\s*(?:F|FLOOR)\.?\b/giu,
    (sourceText, floorRef: string) => {
      address3dParts.push({
        floorExpression: sourceText.trim(),
        floorRef: floorRef.toLocaleUpperCase('en') || null,
        floorType: englishFloorReferenceType(floorRef),
        kind: 'floor',
        sourceText: sourceText.trim(),
      })
      return ' '
    },
  )
  address2dText = address2dText.replace(
    /\b(?:level\s+([a-z]?\d+)|([a-z]?\d+)(?:st|nd|rd|th)?\s+floor|ground\s+floor|upper\s+ground\s+floor|lower\s+ground\s+floor|basement|mezzanine|concourse|podium|roof)\b/giu,
    (sourceText, levelRef?: string, ordinalRef?: string) => {
      const floorRef = levelRef ?? ordinalRef ?? null
      address3dParts.push({
        floorExpression: sourceText.trim(),
        floorRef: floorRef?.toLocaleUpperCase('en') ?? null,
        floorType: englishFloorExpressionType(sourceText),
        kind: 'floor',
        sourceText: sourceText.trim(),
      })
      return ' '
    },
  )

  return { address2dText, address3dParts }
}

function englishUnitType(value: string) {
  const descriptor = value.toLocaleLowerCase('en')
  if (descriptor === 'rm') return 'room' as const
  if (descriptor === 'counter') return 'other' as const
  if (
    ['flat', 'room', 'shop', 'suite', 'unit', 'stall', 'kiosk', 'office'].includes(
      descriptor,
    )
  ) {
    return descriptor as
      | 'flat'
      | 'room'
      | 'shop'
      | 'suite'
      | 'unit'
      | 'stall'
      | 'kiosk'
      | 'office'
  }
  return 'other' as const
}

function chineseUnitType(value?: string) {
  if (value === '室') return 'room' as const
  if (value === '舖' || value === '鋪') return 'shop' as const
  return 'other' as const
}

function chineseFloorType(value: string) {
  if (value === '地下') return 'ground_floor' as const
  if (value === '地庫') return 'basement' as const
  if (value === '平台') return 'podium' as const
  if (value === '閣樓') return 'mezzanine' as const
  return 'other' as const
}

function englishFloorReferenceType(value: string) {
  const reference = value.toLocaleUpperCase('en')
  if (reference === 'G') return 'ground_floor' as const
  if (reference === 'UG') return 'upper_ground_floor' as const
  if (reference === 'LG') return 'lower_ground_floor' as const
  if (reference.startsWith('B')) return 'basement' as const
  if (reference.startsWith('P')) return 'podium' as const
  return 'floor' as const
}

function englishFloorExpressionType(value: string) {
  const expression = value.toLocaleLowerCase('en')
  if (expression.includes('upper ground')) return 'upper_ground_floor' as const
  if (expression.includes('lower ground')) return 'lower_ground_floor' as const
  if (expression.includes('ground')) return 'ground_floor' as const
  if (expression.includes('basement')) return 'basement' as const
  if (expression.includes('mezzanine')) return 'mezzanine' as const
  if (expression.includes('concourse')) return 'concourse' as const
  if (expression.includes('podium')) return 'podium' as const
  if (expression.includes('roof')) return 'roof' as const
  return 'floor' as const
}

function normaliseAddressReference(value: string) {
  return value.normalize('NFKC').toLocaleUpperCase('en').replaceAll(/\s+/g, ' ').trim()
}

type StreetTextMatch = {
  end: number
  start: number
  street: PreparedStreetDefinition
}

function findStreetMatch(
  normalisedAddress: string,
  streets: PreparedStreetDefinition[],
): StreetTextMatch | null {
  for (const street of streets) {
    const start = normalisedAddress.indexOf(street.normalisedName)
    if (start < 0) continue
    return { end: start + street.normalisedName.length, start, street }
  }
  return null
}

type BuildingNumberTextMatch = {
  end: number
  expression: string
  start: number
}

function findBuildingNumberBesideStreet(
  normalisedAddress: string,
  street: StreetTextMatch,
): BuildingNumberTextMatch | null {
  const before = normalisedAddress.slice(0, street.start)
  const beforeMatch = /(\d+[A-Z]?(?:\s*-\s*\d+[A-Z]?)?)\s*$/u.exec(before)
  if (beforeMatch?.[1] && beforeMatch.index !== undefined) {
    return {
      end: street.start,
      expression: beforeMatch[1].replaceAll(/\s+/g, ''),
      start: beforeMatch.index,
    }
  }

  const after = normalisedAddress.slice(street.end)
  const afterMatch = /^\s*(\d+[A-Z]?(?:\s*-\s*\d+[A-Z]?)?)(?:\s*號)?/u.exec(after)
  if (!afterMatch?.[1]) return null
  return {
    end: street.end + afterMatch[0].length,
    expression: afterMatch[1].replaceAll(/\s+/g, ''),
    start: street.end,
  }
}

function expandSourceBuildingNumberExpression(expression: string) {
  const normalised = expression.toLocaleUpperCase('en').replace('–', '-')
  const [from, to, extra] = normalised.split('-')
  if (!from) return []
  if (!to || extra) return [from]
  return [...new Set([from, ...expandBuildingNumberRange(from, to), to])]
}

function removeRecognised2dComponents(
  normalisedAddress: string,
  street: StreetTextMatch | null,
  buildingNumber: BuildingNumberTextMatch | null,
) {
  if (!street) return normalisedAddress || null
  const start = Math.min(street.start, buildingNumber?.start ?? street.start)
  const end = Math.max(street.end, buildingNumber?.end ?? street.end)
  const remainder =
    `${normalisedAddress.slice(0, start)} ${normalisedAddress.slice(end)}`
      .replaceAll(/\s+/g, ' ')
      .trim()
  return remainder || null
}

function matchParsedPlaceAddress(
  parsed: ParsedPlaceAddress,
  matcher: PlaceAddressMatcher,
) {
  const exactIds = matcher.byExactText.get(parsed.normalisedAddress2dText)
  if (exactIds?.size === 1) {
    const addressId = exactIds.values().next().value
    return addressId ? [{ addressId, score: 1_000 }] : []
  }

  const candidates = new Set(
    candidateAddressComponentKeys(parsed).flatMap(
      key => matcher.byBuildingNumberAndStreet.get(key) ?? [],
    ),
  )
  const matches: Array<{ addressId: string; score: number }> = []
  for (const definition of candidates) {
    if (
      !definition.buildingNumbers.some(number =>
        parsed.buildingNumbers.includes(number),
      ) ||
      !containsComponent(
        parsed.normalisedAddress2dText,
        definition.normalisedStreetName,
      )
    ) {
      continue
    }

    let score = 100 + definition.normalisedStreetName.length
    for (const component of [
      definition.normalisedBuildingName,
      definition.normalisedEstateName,
      normaliseOptional(definition.blockExpression),
      normaliseOptional(definition.phaseExpression),
    ]) {
      if (component && containsComponent(parsed.normalisedAddress2dText, component)) {
        score += 25 + component.length
      }
    }
    matches.push({ addressId: definition.addressId, score })
  }
  return matches
}

function definitionBuildingNumbers(definition: PlaceAddressDefinition) {
  const from = normaliseBuildingNumber(definition.buildingNumberFrom)
  const to = normaliseBuildingNumber(definition.buildingNumberTo)
  const numbers = new Set<string>()
  if (from) numbers.add(from)
  if (to) numbers.add(to)

  if (from && to) {
    for (const member of expandBuildingNumberRange(from, to)) numbers.add(member)
  }
  if (definition.buildingNumberExpression) {
    for (const number of extractBuildingNumbers(definition.buildingNumberExpression))
      numbers.add(number)
  }
  return [...numbers]
}

function expandBuildingNumberRange(from: string, to: string) {
  const fromInteger = /^(\d+)$/.exec(from)
  const toInteger = /^(\d+)$/.exec(to)
  if (fromInteger?.[1] && toInteger?.[1]) {
    const start = Number(fromInteger[1])
    const end = Number(toInteger[1])
    if (end < start || end - start > 500) return []
    const step = start % 2 === end % 2 ? 2 : 1
    return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) =>
      String(start + index * step),
    )
  }

  const fromSuffix = /^(\d+)([A-Z])$/.exec(from)
  const toSuffix = /^(\d+)([A-Z])$/.exec(to)
  if (
    !fromSuffix?.[1] ||
    !fromSuffix[2] ||
    !toSuffix?.[1] ||
    !toSuffix[2] ||
    fromSuffix[1] !== toSuffix[1]
  ) {
    return []
  }
  const start = fromSuffix[2].charCodeAt(0)
  const end = toSuffix[2].charCodeAt(0)
  if (end < start) return []
  return Array.from(
    { length: end - start + 1 },
    (_, index) => `${fromSuffix[1]}${String.fromCharCode(start + index)}`,
  )
}

function extractBuildingNumbers(value: string) {
  return [
    ...new Set(
      [
        ...value.matchAll(/(?<![\p{L}\p{N}])\d+[A-Z]?(?![\p{L}\p{N}])/gu),
        ...value.matchAll(/\d+[A-Z]?(?=號)/gu),
      ].map(match => match[0]),
    ),
  ]
}

function candidateAddressComponentKeys(parsed: ParsedPlaceAddress) {
  const keys = new Set<string>()
  for (const buildingNumber of parsed.buildingNumbers) {
    const escapedNumber = buildingNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(^|[^0-9A-Z])${escapedNumber}(?=$|[^0-9A-Z])`, 'gu')
    for (const match of parsed.normalisedAddress2dText.matchAll(pattern)) {
      if (match.index === undefined) continue
      const numberStart = match.index + (match[1]?.length ?? 0)
      const before = parsed.normalisedAddress2dText
        .slice(0, numberStart)
        .replaceAll(' ', '')
      const after = parsed.normalisedAddress2dText
        .slice(numberStart + buildingNumber.length)
        .replace(/^號/u, '')
        .replaceAll(' ', '')
      const maximumLength = 40
      for (
        let length = 2;
        length <= Math.min(maximumLength, before.length);
        length += 1
      ) {
        keys.add(`${buildingNumber}\0${before.slice(-length)}`)
      }
      for (
        let length = 2;
        length <= Math.min(maximumLength, after.length);
        length += 1
      ) {
        keys.add(`${buildingNumber}\0${after.slice(0, length)}`)
      }
    }
  }
  return [...keys]
}

function addressComponentKey(buildingNumber: string, streetName: string) {
  return `${buildingNumber}\0${streetName.replaceAll(' ', '')}`
}

function normaliseAddressText(value: string) {
  const expanded = normaliseChineseNumbers(value.normalize('NFKC'))
    .toLocaleUpperCase('en')
    .replaceAll(/[’']/g, '')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return expanded
    .split(/\s+/)
    .map(token => ENGLISH_ADDRESS_ABBREVIATIONS.get(token) ?? token)
    .join(' ')
}

function containsComponent(value: string, component: string) {
  if (value.includes(component)) return true
  return value.replaceAll(' ', '').includes(component.replaceAll(' ', ''))
}

function normaliseChineseNumbers(value: string) {
  return value.replace(/[零〇一二兩三四五六七八九十百千]+(?=[號期座樓層])/g, number =>
    String(parseChineseInteger(number) ?? number),
  )
}

function parseChineseInteger(value: string) {
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1_000 }
  let total = 0
  let current = 0
  for (const character of value) {
    if (character in digits) {
      current = digits[character] ?? 0
      continue
    }
    const unit = units[character]
    if (!unit) return null
    total += (current || 1) * unit
    current = 0
  }
  return total + current
}

function normaliseBuildingNumber(value: string | null) {
  return text(value)?.normalize('NFKC').toLocaleUpperCase('en').replaceAll(/\s+/g, '')
}

function normaliseOptional(value: string | null) {
  const present = text(value)
  return present ? normaliseAddressText(present) : null
}

function normaliseDefinitionLocale(locale: string): SupportedLocale | null {
  const normalised = locale.toLowerCase().replaceAll('_', '-')
  if (normalised === 'en') return 'en'
  if (['zh-hant', 'zh-hk', 'zh-tw'].includes(normalised)) return 'zh-hant'
  return null
}

function text(value: string | null) {
  return value?.trim() || null
}
