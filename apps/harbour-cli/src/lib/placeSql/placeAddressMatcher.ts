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
  recognised2dComponents: ParsedAddress2dComponent[]
  street: {
    locale: SupportedLocale
    name: string
    normalisedName: string
    streetIds: string[]
  } | null
  unclassified2dText: string | null
}

export type ParsedAddress2dComponent = {
  kind: 'buildingName' | 'estateName' | 'blockExpression' | 'phaseExpression'
  name: string
  normalisedName: string
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

type PreparedAddressComponent = ParsedAddress2dComponent & {
  definitions: PreparedAddressDefinition[]
}

export type PlaceAddressMatcher = {
  byBuildingNumberAndStreet: Map<string, PreparedAddressDefinition[]>
  byCanonicalComponent: Map<string, PreparedAddressDefinition[]>
  byExactText: Map<string, Set<string>>
  componentsByLongestName: PreparedAddressComponent[]
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
  const byCanonicalComponent = new Map<string, PreparedAddressDefinition[]>()
  const byExactText = new Map<string, Set<string>>()
  const componentsByKey = new Map<string, PreparedAddressComponent>()
  const streetsByKey = new Map<string, PreparedStreetDefinition>()

  for (const definition of definitions) {
    const locale = normaliseDefinitionLocale(definition.locale)
    const streetName = text(definition.streetName)
    if (!locale) continue
    const buildingNumbers = definitionBuildingNumbers(definition)

    const prepared: PreparedAddressDefinition = {
      ...definition,
      buildingNumbers,
      locale,
      normalisedBuildingName: normaliseOptional(definition.buildingName),
      normalisedEstateName: normaliseOptional(definition.estateName),
      normalisedFormattedAddress: normaliseOptional(definition.formattedAddress),
      normalisedStreetName: streetName ? normaliseAddressText(streetName) : '',
    }
    if (streetName) {
      addPreparedStreet(streetsByKey, {
        locale,
        name: streetName,
        normalisedName: prepared.normalisedStreetName,
        streetIds: [],
      })
      for (const buildingNumber of buildingNumbers) {
        const key = addressComponentKey(buildingNumber, prepared.normalisedStreetName)
        const definitionsForComponent = byBuildingNumberAndStreet.get(key) ?? []
        definitionsForComponent.push(prepared)
        byBuildingNumberAndStreet.set(key, definitionsForComponent)
      }
    }

    if (prepared.normalisedFormattedAddress) {
      const ids = byExactText.get(prepared.normalisedFormattedAddress) ?? new Set()
      ids.add(prepared.addressId)
      byExactText.set(prepared.normalisedFormattedAddress, ids)
    }

    for (const component of preparedDefinitionComponents(prepared)) {
      const key = canonicalComponentKey(component.kind, component.normalisedName)
      const definitionsForComponent = byCanonicalComponent.get(key) ?? []
      definitionsForComponent.push(prepared)
      byCanonicalComponent.set(key, definitionsForComponent)
      const componentKey = `${component.kind}\0${prepared.locale}\0${component.normalisedName}`
      const existing = componentsByKey.get(componentKey)
      if (existing) {
        existing.definitions.push(prepared)
      } else {
        componentsByKey.set(componentKey, { ...component, definitions: [prepared] })
      }
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
    byCanonicalComponent,
    byExactText,
    componentsByLongestName: [...componentsByKey.values()].sort(
      (left, right) => right.normalisedName.length - left.normalisedName.length,
    ),
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
  matcher?: Pick<
    PlaceAddressMatcher,
    'componentsByLongestName' | 'streetsByLongestName'
  >,
): ParsedPlaceAddress {
  const stripped = stripAddress3d(normaliseChineseNumbers(sourceText.normalize('NFKC')))
  let address2dText = stripped.address2dText
  address2dText = address2dText
    .replaceAll(/(?:^|\s)[.&]+(?=\s|,|$)/g, ' ')
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
    ? findBuildingNumberBesideStreet(
        normalisedAddress2dText,
        streetMatch,
        address2dText,
      )
    : null
  const buildingNumberExpression = buildingNumberMatch?.expression ?? null
  const buildingNumbers = buildingNumberExpression
    ? expandSourceBuildingNumberExpression(buildingNumberExpression)
    : []
  const recognised2dComponents = findCanonicalComponentMatches(
    normalisedAddress2dText,
    matcher?.componentsByLongestName ?? [],
  )
  const unclassified2dText = removeRecognised2dComponents(
    normalisedAddress2dText,
    streetMatch,
    buildingNumberMatch,
    recognised2dComponents,
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
    recognised2dComponents,
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
    /(\d+)\s*(樓|層)(?:\s*([A-Z0-9]+(?:[-–][A-Z0-9]+)*)(?:號)?(室|舖|鋪)?)?/giu,
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
        const unitExpression = sourceText.slice(floorExpression.length).trim()
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
    /\b(shop|unit|room|rm|flat|suite|stall|kiosk|office|counter)\s+(?:no\.?\s*)?([a-z0-9]+(?:\s*(?:-|&|\/|and)\s*[a-z0-9]+)*(?:\s*,\s*[a-z](?:[0-9-]*)?)*)(?=\s*(?:,|$|\d+|level\b|\d+(?:st|nd|rd|th)?\s+floor\b|地庫|地下|平台|閣樓))/giu,
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
    /\b([BGLUP]?\d*|\d+)\s*\/\s*(?:F|FLOOR)\b\.?(?=\s|,|&|$)/giu,
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

  address3dParts.sort(
    (left, right) => value.indexOf(left.sourceText) - value.indexOf(right.sourceText),
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
    const start = normalisedAddress.lastIndexOf(street.normalisedName)
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
  sourceAddress: string,
): BuildingNumberTextMatch | null {
  const before = normalisedAddress.slice(0, street.start)
  for (const sourceRange of sourceAddress.matchAll(
    /\b(\d+[A-Z]?)\s*[-–]\s*(\d+[A-Z]?)\b/giu,
  )) {
    if (!sourceRange[1] || !sourceRange[2]) continue
    const normalisedRange = `${sourceRange[1]} ${sourceRange[2]}`.toLocaleUpperCase(
      'en',
    )
    if (!before.trimEnd().endsWith(normalisedRange)) continue
    return {
      end: street.start,
      expression: `${sourceRange[1]}-${sourceRange[2]}`.toLocaleUpperCase('en'),
      start: before.lastIndexOf(normalisedRange),
    }
  }

  const beforeMatch = /(\d+[A-Z]?)(?:號)?\s*$/u.exec(before)
  if (beforeMatch?.[1] && beforeMatch.index !== undefined) {
    const beforeNumber = before.slice(0, beforeMatch.index)
    const preposition = /(?:^|\s)ON\s*$/u.exec(beforeNumber)
    return {
      end: street.start,
      expression: beforeMatch[1],
      start: preposition?.index ?? beforeMatch.index,
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
  components: ParsedAddress2dComponent[],
) {
  const ranges = components.map(component =>
    componentRange(normalisedAddress, component),
  )
  if (street) {
    ranges.push({
      end: Math.max(street.end, buildingNumber?.end ?? street.end),
      start: Math.min(street.start, buildingNumber?.start ?? street.start),
    })
  }
  const remainder = removeRanges(normalisedAddress, ranges)
  return remainder || null
}

function preparedDefinitionComponents(
  definition: PreparedAddressDefinition,
): ParsedAddress2dComponent[] {
  return [
    ['buildingName', definition.buildingName],
    ['estateName', definition.estateName],
    ['blockExpression', definition.blockExpression],
    ['phaseExpression', definition.phaseExpression],
  ].flatMap(([kind, name]) => {
    const present = text(name)
    if (!present) return []
    return [
      {
        kind: kind as ParsedAddress2dComponent['kind'],
        name: present,
        normalisedName: normaliseAddressText(present),
      },
    ]
  })
}

function findCanonicalComponentMatches(
  normalisedAddress: string,
  components: PreparedAddressComponent[],
) {
  const matches: Array<ParsedAddress2dComponent & { start: number; end: number }> = []
  for (const component of components) {
    const start = componentStart(normalisedAddress, component.normalisedName)
    if (start < 0) continue
    const end = start + component.normalisedName.length
    if (matches.some(match => rangesOverlap(match, { start, end }))) continue
    matches.push({
      end,
      kind: component.kind,
      name: component.name,
      normalisedName: component.normalisedName,
      start,
    })
  }
  return matches
    .sort((left, right) => left.start - right.start)
    .map(({ end: _end, start: _start, ...component }) => component)
}

function componentRange(
  normalisedAddress: string,
  component: ParsedAddress2dComponent,
) {
  const start = componentStart(normalisedAddress, component.normalisedName)
  return { end: start + component.normalisedName.length, start }
}

function componentStart(value: string, component: string) {
  let offset = value.indexOf(component)
  while (offset >= 0) {
    const before = value[offset - 1]
    const after = value[offset + component.length]
    if (
      (!before || !/[A-Z0-9]/u.test(before)) &&
      (!after || !/[A-Z0-9]/u.test(after))
    ) {
      return offset
    }
    offset = value.indexOf(component, offset + 1)
  }
  return -1
}

function rangesOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
) {
  return left.start < right.end && right.start < left.end
}

function removeRanges(value: string, ranges: Array<{ start: number; end: number }>) {
  return ranges
    .filter(range => range.start >= 0)
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, range) => `${result.slice(0, range.start)} ${result.slice(range.end)}`,
      value,
    )
    .replaceAll(/\s+/g, ' ')
    .trim()
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

  const streetNumberCandidates = new Set(
    candidateAddressComponentKeys(parsed).flatMap(
      key => matcher.byBuildingNumberAndStreet.get(key) ?? [],
    ),
  )
  const componentCandidates = parsed.recognised2dComponents.map(component => ({
    component,
    definitions: new Set(
      matcher.byCanonicalComponent.get(
        canonicalComponentKey(component.kind, component.normalisedName),
      ) ?? [],
    ),
  }))
  const candidates = new Set([
    ...streetNumberCandidates,
    ...componentCandidates.flatMap(({ definitions }) => [...definitions]),
  ])
  const matches: Array<{ addressId: string; score: number }> = []
  for (const definition of candidates) {
    const hasStreetNumber =
      definition.buildingNumbers.some(number =>
        parsed.buildingNumbers.includes(number),
      ) &&
      !!definition.normalisedStreetName &&
      containsComponent(parsed.normalisedAddress2dText, definition.normalisedStreetName)
    const matchingComponents = componentCandidates.filter(({ definitions }) =>
      definitions.has(definition),
    )
    if (!hasStreetNumber && matchingComponents.length === 0) {
      continue
    }

    let score = hasStreetNumber ? 100 + definition.normalisedStreetName.length : 0
    score += matchingComponents.reduce(
      (total, { component }) => total + 250 + component.normalisedName.length,
      0,
    )
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

function canonicalComponentKey(
  kind: ParsedAddress2dComponent['kind'],
  normalisedName: string,
) {
  return `${kind}\0${normalisedName}`
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

function text(value: string | null | undefined) {
  return value?.trim() || null
}
