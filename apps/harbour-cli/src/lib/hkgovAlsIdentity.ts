import { buildDeterministicUuidV5 } from '@repo/db'

const ALS_ADDRESS_ID_NAMESPACE = 'ac5f6d22-6c45-5b61-8f56-5f31fc39cd5d'

export type HkgovAlsIdentityInput = {
  buildingIdentity: string
  districtId: string | null
  latitude: number | null
  longitude: number | null
  numberFrom: string | null
  numberTo: string | null
  routeNames: string[]
}

export type HkgovAlsPremiseIdentityInput = {
  blockDescriptor: string | null
  blockNumber: string | null
  buildingName: string | null
  csuId: string | null
  districtName: string | null
  estateName: string | null
  geoAddress: string | null
  latitude: number | null
  longitude: number | null
  numberFrom: string | null
  numberTo: string | null
  phaseName: string | null
  phaseNumber: string | null
  routeKind: 'street' | 'village' | 'unknown'
  routeName: string | null
  unitDescriptor: string | null
  unitNumber: string | null
}

export type HkgovAlsPremiseIdentityDescriptor = {
  continuityKey: string
  identityKey: string
  summary: Record<string, string | null>
}

export type OvertureAddressIdentityRow = {
  canonicalId: string
  districtId: string | null
  latitude: number | null
  longitude: number | null
  streetName: string | null
  streetNumber: string | null
}

export type HkgovAlsIdentityBridge = {
  authority: 'hkgov-dpo'
  generatedAt: string
  mappings: Array<{
    canonicalId: string
    identityKey: string
    matchMethod: string
  }>
  overtureRelease: string | null
  version: 1
}

export type HkgovAlsIdentityResolution = {
  canonicalId: string
  identityAlias: string | null
  identityKey: string
  matchMethod:
    | 'bridge'
    | 'overture-address-coordinate'
    | 'overture-address'
    | 'provisional'
  provisionalId: string
}

export type HkgovAlsIdentityMatchStats = {
  ambiguous: number
  bridged: number
  matchedByAddress: number
  matchedByAddressCoordinate: number
  provisional: number
}

export type HkgovAlsMatchDiagnosticReason =
  | 'gers-claimed-by-multiple-als-identities'
  | 'missing-district'
  | 'missing-number'
  | 'missing-route'
  | 'multiple-address-candidates'
  | 'multiple-address-coordinate-candidates'
  | 'no-overture-candidate'
  | 'same-coordinate-and-number-but-route-or-district-differs'
  | 'same-coordinate-but-address-differs'
  | 'same-route-but-number-differs'

export type HkgovAlsIdentityMatchDiagnostic = {
  candidateCount: number
  candidates: OvertureAddressIdentityRow[]
  candidatesTruncated: boolean
  conflictingAlsIdentityKeys: string[]
  identityKey: string
  inputIndex: number
  kind: 'near-match' | 'no-match'
  provisionalId: string
  reasons: HkgovAlsMatchDiagnosticReason[]
}

export function buildHkgovAlsIdentityKey(input: HkgovAlsIdentityInput) {
  const buildingIdentity = normalizeIdentityToken(input.buildingIdentity)
  const numbers = [input.numberFrom, input.numberTo]
    .map(normalizeIdentityToken)
    .filter(Boolean)
    .join('-')

  if (!buildingIdentity) {
    throw new Error('ALS address is missing its building identity (GeoAddress/CSU ID).')
  }

  return [buildingIdentity, numbers].join('\u0000')
}

/**
 * Builds the stable identity for one ALS premise, rather than a coarser street-level
 * address. GeoAddress is deliberately not sufficient: an ALS GeoAddress may cover
 * several independently named blocks, houses, facilities, or other premises.
 */
export function buildHkgovAlsPremiseIdentity(
  input: HkgovAlsPremiseIdentityInput,
): HkgovAlsPremiseIdentityDescriptor {
  const buildingReference = token(input.csuId) || token(input.geoAddress)
  if (!buildingReference) {
    throw new Error('ALS premise is missing both CsuId and GeoAddress.')
  }

  const summary = {
    blockDescriptor: value(input.blockDescriptor),
    blockNumber: value(input.blockNumber),
    buildingName: value(input.buildingName),
    csuId: value(input.csuId),
    districtName: value(input.districtName),
    estateName: value(input.estateName),
    geoAddress: value(input.geoAddress),
    latitude: input.latitude == null ? null : input.latitude.toFixed(5),
    longitude: input.longitude == null ? null : input.longitude.toFixed(5),
    numberFrom: value(input.numberFrom),
    numberTo: value(input.numberTo),
    phaseName: value(input.phaseName),
    phaseNumber: value(input.phaseNumber),
    routeKind: input.routeKind,
    routeName: value(input.routeName),
    unitDescriptor: value(input.unitDescriptor),
    unitNumber: value(input.unitNumber),
  }
  const continuityKey = joinIdentityParts([
    'hkgov-als-premise-continuity-v1',
    summary.csuId ?? summary.geoAddress,
    summary.districtName,
    summary.routeKind,
    summary.routeName,
    summary.numberFrom,
    summary.numberTo,
    summary.longitude,
    summary.latitude,
  ])
  const identityKey = joinIdentityParts([
    'hkgov-als-premise-v1',
    buildingReference,
    summary.districtName,
    summary.routeKind,
    summary.routeName,
    summary.numberFrom,
    summary.numberTo,
    summary.estateName,
    summary.phaseName,
    summary.phaseNumber,
    summary.blockDescriptor,
    summary.blockNumber,
    summary.buildingName,
    summary.unitDescriptor,
    summary.unitNumber,
  ])

  return { continuityKey, identityKey, summary }
}

export function buildHkgovAlsProvisionalId(identityKey: string) {
  return `ss-${buildDeterministicUuidV5(ALS_ADDRESS_ID_NAMESPACE, identityKey)}`
}

export function resolveHkgovAlsIdentities(
  inputs: HkgovAlsIdentityInput[],
  overtureRows: OvertureAddressIdentityRow[],
  bridgeMappings: ReadonlyMap<string, string> = new Map(),
): {
  diagnostics: HkgovAlsIdentityMatchDiagnostic[]
  resolutions: HkgovAlsIdentityResolution[]
  stats: HkgovAlsIdentityMatchStats
} {
  const overtureByAddressCoordinate = new Map<string, Set<string>>()
  const overtureByAddress = new Map<string, Set<string>>()
  const overtureByCoordinate = new Map<string, Set<string>>()
  const overtureByCoordinateNumber = new Map<string, Set<string>>()
  const overtureByDistrictRoute = new Map<string, Set<string>>()
  const overtureRowsById = new Map<string, OvertureAddressIdentityRow>()

  for (const row of overtureRows) {
    overtureRowsById.set(row.canonicalId, row)
    const addressKey = buildAddressKey(row.districtId, row.streetName, row.streetNumber)
    const coordinateKey = buildCoordinateKey(row.longitude, row.latitude)
    const numberKey = normalizeMatchNumber(row.streetNumber)
    const districtRouteKey = buildDistrictRouteKey(row.districtId, row.streetName)

    if (coordinateKey) {
      addCandidate(overtureByCoordinate, coordinateKey, row.canonicalId)
      if (numberKey) {
        addCandidate(
          overtureByCoordinateNumber,
          `${coordinateKey}\u0000${numberKey}`,
          row.canonicalId,
        )
      }
    }
    if (districtRouteKey) {
      addCandidate(overtureByDistrictRoute, districtRouteKey, row.canonicalId)
    }
    if (!addressKey) continue

    addCandidate(overtureByAddress, addressKey, row.canonicalId)
    if (coordinateKey) {
      addCandidate(
        overtureByAddressCoordinate,
        `${addressKey}\u0000${coordinateKey}`,
        row.canonicalId,
      )
    }
  }

  const proposals: Array<{
    ambiguous: boolean
    canonicalId: string | null
    identityKey: string
    inputIndex: number
    matchMethod: 'bridge' | 'overture-address-coordinate' | 'overture-address' | null
    nearCandidateIds: string[]
    nearReasons: HkgovAlsMatchDiagnosticReason[]
  }> = inputs.map((input, inputIndex) => {
    const identityKey = buildHkgovAlsIdentityKey(input)
    const bridgedCanonicalId = bridgeMappings.get(identityKey) ?? null
    const number = normalizeMatchNumber(input.numberFrom ?? input.numberTo)
    const coordinateKey = buildCoordinateKey(input.longitude, input.latitude)
    const addressKeys = input.routeNames
      .map(routeName => buildAddressKey(input.districtId, routeName, number))
      .filter((value): value is string => Boolean(value))
    const coordinateCandidates = uniqueCandidates(
      addressKeys.map(key =>
        coordinateKey
          ? overtureByAddressCoordinate.get(`${key}\u0000${coordinateKey}`)
          : null,
      ),
    )
    const addressCandidates = uniqueCandidates(
      addressKeys.map(key => overtureByAddress.get(key)),
    )
    const liveMatch =
      coordinateCandidates.length === 1
        ? {
            canonicalId: coordinateCandidates[0] as string,
            matchMethod: 'overture-address-coordinate' as const,
          }
        : addressCandidates.length === 1
          ? {
              canonicalId: addressCandidates[0] as string,
              matchMethod: 'overture-address' as const,
            }
          : null
    const nearMatch =
      liveMatch || bridgedCanonicalId
        ? { candidateIds: [], reasons: [] }
        : resolveNearMatchCandidates({
            addressCandidates,
            coordinateCandidates,
            coordinateNumberCandidates: uniqueCandidates(
              coordinateKey && number
                ? [overtureByCoordinateNumber.get(`${coordinateKey}\u0000${number}`)]
                : [],
            ),
            coordinateOnlyCandidates: uniqueCandidates(
              coordinateKey ? [overtureByCoordinate.get(coordinateKey)] : [],
            ),
            districtRouteCandidates: uniqueCandidates(
              input.routeNames.map(routeName =>
                overtureByDistrictRoute.get(
                  buildDistrictRouteKey(input.districtId, routeName) ?? '',
                ),
              ),
            ),
            input,
            number,
          })

    if (
      bridgedCanonicalId &&
      liveMatch &&
      bridgedCanonicalId !== liveMatch.canonicalId
    ) {
      throw new Error(
        `ALS identity bridge conflict for ${identityKey}: bridge=${bridgedCanonicalId}, live=${liveMatch.canonicalId}.`,
      )
    }

    return {
      ambiguous:
        coordinateCandidates.length > 1 ||
        (coordinateCandidates.length === 0 && addressCandidates.length > 1),
      canonicalId: liveMatch?.canonicalId ?? bridgedCanonicalId,
      identityKey,
      inputIndex,
      matchMethod: liveMatch?.matchMethod ?? (bridgedCanonicalId ? 'bridge' : null),
      nearCandidateIds: nearMatch.candidateIds,
      nearReasons: nearMatch.reasons,
    }
  })

  const liveClaims = new Map<string, Set<string>>()
  for (const proposal of proposals) {
    if (!proposal.canonicalId || proposal.matchMethod === 'bridge') continue
    addCandidate(liveClaims, proposal.canonicalId, proposal.identityKey)
  }

  const stats: HkgovAlsIdentityMatchStats = {
    ambiguous: 0,
    bridged: 0,
    matchedByAddress: 0,
    matchedByAddressCoordinate: 0,
    provisional: 0,
  }
  const diagnostics: HkgovAlsIdentityMatchDiagnostic[] = []
  const resolutions: HkgovAlsIdentityResolution[] = proposals.map(proposal => {
    const liveClaimIsAmbiguous =
      proposal.canonicalId && proposal.matchMethod !== 'bridge'
        ? (liveClaims.get(proposal.canonicalId)?.size ?? 0) > 1
        : false
    const canonicalId = liveClaimIsAmbiguous ? null : proposal.canonicalId
    const matchMethod = liveClaimIsAmbiguous ? null : proposal.matchMethod
    const provisionalId = buildHkgovAlsProvisionalId(proposal.identityKey)

    if (!canonicalId || !matchMethod) {
      stats.provisional += 1
      if (proposal.ambiguous || liveClaimIsAmbiguous) stats.ambiguous += 1
      const conflictingAlsIdentityKeys = liveClaimIsAmbiguous
        ? proposals
            .filter(
              candidate =>
                candidate.canonicalId === proposal.canonicalId &&
                candidate.identityKey !== proposal.identityKey,
            )
            .map(candidate => candidate.identityKey)
        : []
      const diagnosticCandidateIds = liveClaimIsAmbiguous
        ? [proposal.canonicalId as string]
        : proposal.nearCandidateIds
      const diagnosticReasons = liveClaimIsAmbiguous
        ? (['gers-claimed-by-multiple-als-identities'] as const)
        : proposal.nearReasons
      diagnostics.push(
        buildMatchDiagnostic({
          candidateIds: diagnosticCandidateIds,
          conflictingAlsIdentityKeys,
          identityKey: proposal.identityKey,
          inputIndex: proposal.inputIndex,
          overtureRowsById,
          provisionalId,
          reasons: [...diagnosticReasons],
        }),
      )
      return {
        canonicalId: provisionalId,
        identityAlias: null,
        identityKey: proposal.identityKey,
        matchMethod: 'provisional' as const,
        provisionalId,
      }
    }

    if (matchMethod === 'bridge') stats.bridged += 1
    if (matchMethod === 'overture-address') stats.matchedByAddress += 1
    if (matchMethod === 'overture-address-coordinate') {
      stats.matchedByAddressCoordinate += 1
    }

    return {
      canonicalId,
      identityAlias: provisionalId,
      identityKey: proposal.identityKey,
      matchMethod,
      provisionalId,
    }
  })

  return { diagnostics, resolutions, stats }
}

export function bridgeMapFromFile(bridge: HkgovAlsIdentityBridge) {
  if (bridge.version !== 1 || bridge.authority !== 'hkgov-dpo') {
    throw new Error('Unsupported HKGov ALS identity bridge format.')
  }

  const mappings = new Map<string, string>()
  for (const mapping of bridge.mappings) {
    const existing = mappings.get(mapping.identityKey)
    if (existing && existing !== mapping.canonicalId) {
      throw new Error(`Conflicting bridge mappings for ${mapping.identityKey}.`)
    }
    mappings.set(mapping.identityKey, mapping.canonicalId)
  }
  return mappings
}

export function mergePersistedHkgovAlsAliases(
  inputs: HkgovAlsIdentityInput[],
  bridgeMappings: ReadonlyMap<string, string>,
  aliases: Array<{ aliasValue: string; canonicalId: string }>,
) {
  const merged = new Map(bridgeMappings)
  const canonicalIdByAlias = new Map(
    aliases.map(alias => [alias.aliasValue, alias.canonicalId]),
  )

  for (const input of inputs) {
    const identityKey = buildHkgovAlsIdentityKey(input)
    const canonicalId = canonicalIdByAlias.get(buildHkgovAlsProvisionalId(identityKey))
    if (!canonicalId) continue
    const existing = merged.get(identityKey)
    if (existing && existing !== canonicalId) {
      throw new Error(
        `ALS identity mapping conflict for ${identityKey}: bridge=${existing}, registry=${canonicalId}.`,
      )
    }
    merged.set(identityKey, canonicalId)
  }

  return merged
}

function resolveNearMatchCandidates(args: {
  addressCandidates: string[]
  coordinateCandidates: string[]
  coordinateNumberCandidates: string[]
  coordinateOnlyCandidates: string[]
  districtRouteCandidates: string[]
  input: HkgovAlsIdentityInput
  number: string
}) {
  const missingReasons: HkgovAlsMatchDiagnosticReason[] = []
  if (!args.input.districtId) missingReasons.push('missing-district')
  if (!args.number) missingReasons.push('missing-number')
  if (args.input.routeNames.length === 0) missingReasons.push('missing-route')

  if (args.coordinateCandidates.length > 1) {
    return {
      candidateIds: args.coordinateCandidates,
      reasons: [
        ...missingReasons,
        'multiple-address-coordinate-candidates',
      ] satisfies HkgovAlsMatchDiagnosticReason[],
    }
  }
  if (args.coordinateCandidates.length === 0 && args.addressCandidates.length > 1) {
    return {
      candidateIds: args.addressCandidates,
      reasons: [
        ...missingReasons,
        'multiple-address-candidates',
      ] satisfies HkgovAlsMatchDiagnosticReason[],
    }
  }
  if (args.coordinateNumberCandidates.length > 0) {
    return {
      candidateIds: args.coordinateNumberCandidates,
      reasons: [
        ...missingReasons,
        'same-coordinate-and-number-but-route-or-district-differs',
      ] satisfies HkgovAlsMatchDiagnosticReason[],
    }
  }
  if (args.coordinateOnlyCandidates.length > 0) {
    return {
      candidateIds: args.coordinateOnlyCandidates,
      reasons: [
        ...missingReasons,
        'same-coordinate-but-address-differs',
      ] satisfies HkgovAlsMatchDiagnosticReason[],
    }
  }
  if (args.districtRouteCandidates.length > 0) {
    return {
      candidateIds: args.districtRouteCandidates,
      reasons: [
        ...missingReasons,
        'same-route-but-number-differs',
      ] satisfies HkgovAlsMatchDiagnosticReason[],
    }
  }

  return {
    candidateIds: [],
    reasons: [
      ...missingReasons,
      'no-overture-candidate',
    ] satisfies HkgovAlsMatchDiagnosticReason[],
  }
}

function buildMatchDiagnostic(args: {
  candidateIds: string[]
  conflictingAlsIdentityKeys: string[]
  identityKey: string
  inputIndex: number
  overtureRowsById: ReadonlyMap<string, OvertureAddressIdentityRow>
  provisionalId: string
  reasons: HkgovAlsMatchDiagnosticReason[]
}): HkgovAlsIdentityMatchDiagnostic {
  const candidateIds = [...new Set(args.candidateIds)]
  const candidates = candidateIds
    .slice(0, 25)
    .map(candidateId => args.overtureRowsById.get(candidateId))
    .filter((candidate): candidate is OvertureAddressIdentityRow => Boolean(candidate))

  return {
    candidateCount: candidateIds.length,
    candidates,
    candidatesTruncated: candidateIds.length > candidates.length,
    conflictingAlsIdentityKeys: args.conflictingAlsIdentityKeys,
    identityKey: args.identityKey,
    inputIndex: args.inputIndex,
    kind: candidateIds.length > 0 ? 'near-match' : 'no-match',
    provisionalId: args.provisionalId,
    reasons: [...new Set(args.reasons)],
  }
}

function buildAddressKey(
  districtId: string | null,
  streetName: string | null,
  streetNumber: string | null,
) {
  const district = normalizeIdentityToken(districtId)
  const name = normalizeIdentityToken(streetName)
  const number = normalizeMatchNumber(streetNumber)
  return district && name && number ? `${district}\u0000${name}\u0000${number}` : null
}

function buildDistrictRouteKey(districtId: string | null, streetName: string | null) {
  const district = normalizeIdentityToken(districtId)
  const name = normalizeIdentityToken(streetName)
  return district && name ? `${district}\u0000${name}` : null
}

function buildCoordinateKey(longitude: number | null, latitude: number | null) {
  if (longitude == null || latitude == null) return null
  return `${longitude.toFixed(5)}\u0000${latitude.toFixed(5)}`
}

export function normalizeHkgovAlsMatchNumber(value: string | null) {
  return normalizeMatchNumber(value)
}

function normalizeMatchNumber(value: string | null) {
  const firstNumber = value?.split(/\s*(?:[/\-–—])\s*/u, 1)[0] ?? null
  return normalizeIdentityToken(firstNumber)
}

function normalizeIdentityToken(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .normalize('NFKC')
        .replace(/[\s\p{P}\p{S}]+/gu, '')
        .toUpperCase()
    : ''
}

function joinIdentityParts(values: Array<string | null>) {
  return values.map(value => value ?? '').join('\u0000')
}

function token(value: unknown) {
  return normalizeIdentityToken(value)
}

function value(input: string | null) {
  const normalized = token(input)
  return normalized || null
}

function addCandidate(map: Map<string, Set<string>>, key: string, value: string) {
  const values = map.get(key) ?? new Set<string>()
  values.add(value)
  map.set(key, values)
}

function uniqueCandidates(candidateSets: Array<Set<string> | null | undefined>) {
  return [...new Set(candidateSets.flatMap(values => (values ? [...values] : [])))]
}
