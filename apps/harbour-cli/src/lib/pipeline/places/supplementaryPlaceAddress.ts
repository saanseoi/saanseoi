import { createHash } from 'node:crypto'
import ruleFixture from '../../../../../../fixtures/meta/processing-rules/place-address-analysis.json'
import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import {
  createPlaceAddressMatcher,
  normaliseAddressText,
  parsePlaceAddress,
  type PlaceAddressDefinition,
  type ParsedPlaceAddress,
} from './placeAddressMatcher.ts'

export type SupplementaryPolicy = {
  automaticThreshold: number
  reviewThreshold: number
  separation: number
  distanceMetres: number
  distanceMarginMetres: number
  weights: Record<
    | 'buildingName'
    | 'estateName'
    | 'blockExpression'
    | 'phaseExpression'
    | 'street'
    | 'number'
    | 'alias'
    | 'geometry',
    number
  >
  aliases: { text: string; addressId: string; locale: string }[]
  replacement: 'explicit-only'
}
export type SupplementaryValues = Omit<PlaceAddressDefinition, 'addressId'> & {
  formattedAddress: string
  provenance?: {
    isHumanVerified: string[]
    isMachineTranslated: string[]
    isLocaleInferred: boolean
  }
}
export type SupplementaryEntry = {
  placeId: string
  identityKey: string
  addressId: string
  fingerprint: string
  normalisedPublisherAddress: string[]
  baseAddressId: string | null
  values: SupplementaryValues[]
  policyVersion: string
  score: number
  evidence: CandidateEvidence[]
  acceptanceMode: 'automatic' | 'curated'
  firstSeen: string
  revokedAt?: string
}
export type SupplementaryDecision = {
  placeId: string
  fingerprint: string
  sourceRelease: string
  previousAddressId: string | null
  resolution:
    | 'keep_existing'
    | 'leave_unlinked'
    | 'link_existing'
    | 'create_supplementary'
  addressId: string | null
  reason: string
  address?: { baseAddressId: string | null; values: SupplementaryValues[] }
  address2dFingerprint?: string
  /** Copied from the selected ALS Address geometry by explicit review. */
  placeGeometryOverride?: { lng: number; lat: number }
}
export type SupplementaryCuration = {
  authority: 'overture-place-address'
  version: 1
  activePolicy: string
  policies: Record<string, SupplementaryPolicy>
  entries: SupplementaryEntry[]
  decisions: SupplementaryDecision[]
}
export type SupplementaryEntryLedger = {
  authority: 'overture-place-address-entries'
  version: 1
  generationVersion: 1
  entries: SupplementaryEntry[]
}

export function parseSupplementaryDecisionJsonLines(value: string) {
  const decisions = value
    .split('\n')
    .filter(line => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as SupplementaryDecision
      } catch {
        throw new Error(
          `Invalid Overture Place Address decision at JSONL line ${index + 1}.`,
        )
      }
    })
  return decisions
}
export type Candidate = {
  addressId: string
  score: number
  breakdown: Record<string, number>
  distanceMetres: number | null
  contradictions: string[]
  parsed: ParsedPlaceAddress
  locale: string
}
export type CandidateEvidence = Omit<Candidate, 'parsed'>
export type AddressObservation = {
  placeId: string
  sourceRelease: string
  texts: string[]
  lng: number
  lat: number
}
export type PreviousAddressLink = {
  addressId: string
  fingerprint: string
  addressSnapshotId?: string | null
}
export type AddressResolution = {
  placeId: string
  sourceTexts: string[]
  fingerprint: string
  lng?: number
  lat?: number
  tier: 'direct' | 'supplementary' | 'review' | 'delayed'
  addressId: string | null
  entry?: SupplementaryEntry
  previous: PreviousAddressLink | SupplementaryEntry | null
  candidates: Candidate[]
  reason: string
  parsed: ParsedPlaceAddress[]
  /** Explicit human-selected replacement for the source Place point. */
  placeGeometryOverride?: { lng: number; lat: number }
}
export type StagedAddressResolution = Omit<AddressResolution, 'candidates'> & {
  candidates: CandidateEvidence[]
}

/**
 * Keeps the durable resolution stream bounded. Full parses and candidate sets
 * are useful only when a reviewer must decide an identity; enrichment needs
 * the selected ID and accepted supplementary entry only.
 */
export function compactAddressResolution(
  resolution: AddressResolution,
): StagedAddressResolution {
  if (resolution.tier === 'review')
    return {
      ...resolution,
      candidates: resolution.candidates.map(candidateEvidence),
    }
  return { ...resolution, candidates: [], parsed: [] }
}

export function addressFingerprint(texts: string[]) {
  return digest([...new Set(texts.map(normaliseAddressText))].sort())
}

export function parsedAddressFingerprint(parsed: ParsedPlaceAddress[]) {
  return digest([...new Set(parsed.map(value => value.normalisedAddress2dText))].sort())
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function supplementaryIdentity(values: SupplementaryValues[]) {
  // A public 2D identity is shared across Places, independently of units, floors,
  // candidate ordering, release, score and source Place IDs.
  const key = JSON.stringify(
    values
      .map(value => ({
        locale: value.locale,
        formattedAddress: normaliseAddressText(value.formattedAddress),
        components: [
          'buildingName',
          'estateName',
          'blockExpression',
          'phaseExpression',
          'streetName',
          'buildingNumberExpression',
          'buildingNumberFrom',
          'buildingNumberTo',
        ].map(key => {
          const text = value[key as keyof SupplementaryValues]
          return typeof text === 'string' ? normaliseAddressText(text) : null
        }),
      }))
      .sort((a, b) => a.locale.localeCompare(b.locale)),
  )
  return { identityKey: key, addressId: `opa-${digest(key)}` }
}

export function emptySupplementaryEntryLedger(): SupplementaryEntryLedger {
  return {
    authority: 'overture-place-address-entries',
    version: 1,
    generationVersion: 1,
    entries: [],
  }
}

export function parseSupplementaryEntryLedger(
  value: unknown,
): SupplementaryEntryLedger {
  const ledger = value as SupplementaryEntryLedger
  if (
    ledger?.authority !== 'overture-place-address-entries' ||
    ledger.version !== 1 ||
    ledger.generationVersion !== 1 ||
    !Array.isArray(ledger.entries)
  ) {
    throw new Error('Invalid generated Overture Place Address entry ledger.')
  }
  return ledger
}

export function parseSupplementaryCuration(
  value: unknown,
  entryLedger: SupplementaryEntryLedger = emptySupplementaryEntryLedger(),
): SupplementaryCuration {
  const policy = value as Omit<SupplementaryCuration, 'entries'> & {
    entries?: unknown
  }
  if ('entries' in policy)
    throw new Error('Overture Place Address policy must not contain generated entries.')
  const fixture = {
    ...policy,
    entries: entryLedger.entries,
  } as SupplementaryCuration
  if (
    fixture?.authority !== 'overture-place-address' ||
    fixture.version !== 1 ||
    !fixture.policies?.[fixture.activePolicy] ||
    !Array.isArray(fixture.entries) ||
    !Array.isArray(fixture.decisions)
  )
    throw new Error('Invalid Overture Place Address curation.')
  for (const policy of Object.values(fixture.policies)) {
    const numbers = [
      policy.automaticThreshold,
      policy.reviewThreshold,
      policy.separation,
      policy.distanceMetres,
      policy.distanceMarginMetres,
      ...[
        'buildingName',
        'estateName',
        'blockExpression',
        'phaseExpression',
        'street',
        'number',
        'alias',
        'geometry',
      ].map(key => policy.weights?.[key as keyof typeof policy.weights]),
    ]
    if (
      numbers.some(value => !Number.isFinite(value) || value < 0) ||
      policy.automaticThreshold <= policy.reviewThreshold ||
      policy.separation <= 0 ||
      !Array.isArray(policy.aliases) ||
      policy.replacement !== 'explicit-only'
    ) {
      throw new Error('Invalid supplementary matching policy.')
    }
    if (
      policy.aliases.some(
        alias =>
          !alias.text?.trim() ||
          !alias.addressId ||
          !['en', 'zh-hant'].includes(alias.locale),
      )
    ) {
      throw new Error('Invalid reviewed supplementary alias.')
    }
  }
  const active = new Set<string>()
  for (const entry of fixture.entries) {
    if (
      !entry.placeId ||
      !entry.firstSeen ||
      !entry.fingerprint ||
      !Array.isArray(entry.values) ||
      entry.values.length === 0 ||
      !fixture.policies[entry.policyVersion] ||
      !Number.isFinite(entry.score) ||
      !['automatic', 'curated'].includes(entry.acceptanceMode) ||
      !Array.isArray(entry.evidence) ||
      !Array.isArray(entry.normalisedPublisherAddress)
    ) {
      throw new Error('Invalid supplementary curation entry.')
    }
    const locales = new Set<string>()
    for (const row of entry.values) {
      if (
        !['en', 'zh-hant'].includes(row.locale) ||
        !row.formattedAddress?.trim() ||
        locales.has(row.locale)
      ) {
        throw new Error(`Invalid supplementary localisations for ${entry.placeId}.`)
      }
      locales.add(row.locale)
    }
    const identity = supplementaryIdentity(entry.values)
    if (
      identity.identityKey !== entry.identityKey ||
      identity.addressId !== entry.addressId
    ) {
      throw new Error(`Supplementary identity mismatch for ${entry.placeId}.`)
    }
    if (entry.fingerprint !== addressFingerprint(entry.normalisedPublisherAddress))
      throw new Error(
        `Supplementary publisher fingerprint mismatch for ${entry.placeId}.`,
      )
    if (!entry.revokedAt) {
      if (active.has(entry.placeId))
        throw new Error(`Duplicate active curation for ${entry.placeId}.`)
      active.add(entry.placeId)
    }
  }
  const decisions = new Set<string>()
  for (const decision of fixture.decisions) {
    const key = `${decision.placeId}\0${decision.sourceRelease}\0${decision.fingerprint}`
    if (
      !decision.placeId ||
      !decision.fingerprint ||
      !decision.sourceRelease ||
      !decision.reason?.trim() ||
      ![
        'keep_existing',
        'leave_unlinked',
        'link_existing',
        'create_supplementary',
      ].includes(decision.resolution) ||
      decisions.has(key) ||
      (decision.resolution === 'leave_unlinked'
        ? decision.addressId !== null
        : !decision.addressId)
    ) {
      throw new Error('Invalid or duplicate supplementary identity decision.')
    }
    decisions.add(key)
    if (decision.placeGeometryOverride) {
      const { lng, lat } = decision.placeGeometryOverride
      if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lng < -180 ||
        lng > 180 ||
        lat < -90 ||
        lat > 90 ||
        decision.addressId === null
      ) {
        throw new Error('Invalid Place geometry override in supplementary decision.')
      }
    }
    if ((decision.resolution === 'create_supplementary') !== Boolean(decision.address))
      throw new Error(
        'Only create_supplementary decisions must contain address values.',
      )
    if (decision.address) {
      const { baseAddressId, values } = decision.address
      if (
        decision.resolution !== 'create_supplementary' ||
        (baseAddressId !== null &&
          (typeof baseAddressId !== 'string' || !baseAddressId)) ||
        !Array.isArray(values) ||
        values.length === 0 ||
        values.some(
          value =>
            !['en', 'zh-hant'].includes(value.locale) ||
            !value.formattedAddress?.trim(),
        ) ||
        new Set(values.map(value => value.locale)).size !== values.length ||
        supplementaryIdentity(values).addressId !== decision.addressId
      )
        throw new Error('Invalid edited supplementary address decision.')
    }
  }
  return fixture
}

export const placeAddressAnalysisRule = registerRule(
  ruleDeclarationFromFixture(ruleFixture),
  (input: {
    definitions: PlaceAddressDefinition[]
    officialIds: Set<string>
    geometry: Map<string, { lng: number; lat: number }>
    fixture: SupplementaryCuration
  }) =>
    createSupplementaryAddressAnalyserInternal(
      input.definitions,
      input.officialIds,
      input.geometry,
      input.fixture,
    ),
)

export function createSupplementaryAddressAnalyser(
  definitions: PlaceAddressDefinition[],
  officialIds: Set<string>,
  geometry: Map<string, { lng: number; lat: number }>,
  fixture: SupplementaryCuration,
) {
  return placeAddressAnalysisRule.execute({
    definitions,
    officialIds,
    geometry,
    fixture,
  })
}

function createSupplementaryAddressAnalyserInternal(
  definitions: PlaceAddressDefinition[],
  officialIds: Set<string>,
  geometry: Map<string, { lng: number; lat: number }>,
  fixture: SupplementaryCuration,
) {
  const matcher = createPlaceAddressMatcher(definitions)
  const policy = fixture.policies[fixture.activePolicy]
  if (!policy) throw new Error('Missing active supplementary policy.')
  const byStreet = new Map<string, typeof matcher.definitions>()
  const byId = new Map<string, typeof matcher.definitions>()
  for (const definition of matcher.definitions) {
    for (const [index, key] of [
      [byStreet, definition.normalisedStreetName],
      [byId, definition.addressId],
    ] as const) {
      const rows = index.get(key) ?? []
      rows.push(definition)
      index.set(key, rows)
    }
  }
  const byPlace = new Map<string, SupplementaryEntry[]>()
  for (const entry of fixture.entries) {
    const entries = byPlace.get(entry.placeId) ?? []
    entries.push(entry)
    byPlace.set(entry.placeId, entries)
  }
  const decisionsByObservation = new Map<string, (typeof fixture.decisions)[number]>()
  let indexedDecisions = fixture.decisions
  let indexedDecisionCount = -1
  return (
    observation: AddressObservation,
    previous: PreviousAddressLink | null,
  ): AddressResolution => {
    const fingerprint = addressFingerprint(observation.texts)
    const parsed = observation.texts.map(text => parsePlaceAddress(text, matcher))
    const entries = (byPlace.get(observation.placeId) ?? []).filter(
      entry =>
        entry.firstSeen <= observation.sourceRelease &&
        (!entry.revokedAt || entry.revokedAt > observation.sourceRelease),
    )
    if (entries.length > 1)
      throw new Error(`Overlapping curation for ${observation.placeId}.`)
    const entry = entries[0]
    const result = (
      tier: AddressResolution['tier'],
      addressId: string | null,
      reason: string,
      candidates: Candidate[] = [],
      accepted?: SupplementaryEntry,
      placeGeometryOverride?: { lng: number; lat: number },
    ): AddressResolution => ({
      placeId: observation.placeId,
      sourceTexts: observation.texts,
      fingerprint,
      lng: placeGeometryOverride?.lng ?? observation.lng,
      lat: placeGeometryOverride?.lat ?? observation.lat,
      tier,
      addressId,
      reason,
      candidates,
      parsed,
      ...(placeGeometryOverride ? { placeGeometryOverride } : {}),
      previous: previous ?? entry ?? null,
      ...(accepted ? { entry: accepted } : {}),
    })
    const reproducible = (accepted: SupplementaryEntry) =>
      (accepted.fingerprint === fingerprint ||
        JSON.stringify(
          accepted.values
            .map(value => normaliseAddressText(value.formattedAddress))
            .sort(),
        ) ===
          JSON.stringify(parsed.map(value => value.normalisedAddress2dText).sort())) &&
      (!accepted.baseAddressId || officialIds.has(accepted.baseAddressId))
    // Reviews append decisions or replace the ledger array; keep those live edits visible.
    if (
      indexedDecisions !== fixture.decisions ||
      indexedDecisionCount !== fixture.decisions.length
    ) {
      decisionsByObservation.clear()
      indexedDecisions = fixture.decisions
      indexedDecisionCount = fixture.decisions.length
      for (const decision of fixture.decisions) {
        const key = JSON.stringify([
          decision.placeId,
          decision.fingerprint,
          decision.sourceRelease,
        ])
        if (!decisionsByObservation.has(key)) decisionsByObservation.set(key, decision)
      }
    }
    const decision = decisionsByObservation.get(
      JSON.stringify([observation.placeId, fingerprint, observation.sourceRelease]),
    )
    if (decision) {
      if (
        decision.previousAddressId !==
          (previous?.addressId ?? entry?.addressId ?? null) &&
        !(
          decision.address &&
          entry?.addressId === decision.addressId &&
          entry.fingerprint === fingerprint
        )
      ) {
        return result('review', null, 'decision_previous_link_mismatch')
      }
      if (decision.resolution === 'leave_unlinked') {
        if (entry) entry.revokedAt = observation.sourceRelease
        return result('delayed', null, 'explicit_retirement')
      }
      if (decision.address) {
        if (
          decision.address.baseAddressId &&
          !officialIds.has(decision.address.baseAddressId)
        )
          return result('review', null, 'decision_base_not_available')
        const accepted: SupplementaryEntry = {
          placeId: observation.placeId,
          ...supplementaryIdentity(decision.address.values),
          fingerprint,
          normalisedPublisherAddress: observation.texts.map(normaliseAddressText),
          baseAddressId: decision.address.baseAddressId,
          values: decision.address.values,
          policyVersion: fixture.activePolicy,
          score: 0,
          evidence: [],
          acceptanceMode: 'curated',
          firstSeen: observation.sourceRelease,
        }
        if (entry && entry.addressId !== accepted.addressId)
          entry.revokedAt = observation.sourceRelease
        if (!entry || entry.addressId !== accepted.addressId)
          fixture.entries.push(accepted)
        byPlace.set(
          observation.placeId,
          fixture.entries.filter(value => value.placeId === observation.placeId),
        )
        return result(
          'supplementary',
          accepted.addressId,
          'explicit_edited_address',
          [],
          accepted,
          decision.placeGeometryOverride,
        )
      }
      if (
        decision.resolution === 'keep_existing' &&
        decision.addressId !== decision.previousAddressId
      ) {
        return result('review', null, 'keep_decision_changes_identity')
      }
      if (decision.addressId && officialIds.has(decision.addressId))
        return result(
          'direct',
          decision.addressId,
          'explicit_decision',
          [],
          undefined,
          decision.placeGeometryOverride,
        )
      if (
        decision.resolution === 'keep_existing' &&
        entry?.addressId === decision.addressId &&
        reproducible(entry)
      ) {
        return result(
          'supplementary',
          entry.addressId,
          'explicit_decision',
          [],
          entry,
          decision.placeGeometryOverride,
        )
      }
      return result('review', null, 'decision_target_not_reproducible')
    }
    const latestDecision = fixture.decisions
      .filter(
        item =>
          item.placeId === observation.placeId &&
          item.sourceRelease <= observation.sourceRelease,
      )
      .sort((a, b) => b.sourceRelease.localeCompare(a.sourceRelease))[0]
    const retiredAddressChanged =
      latestDecision?.resolution === 'leave_unlinked' &&
      latestDecision.fingerprint !== fingerprint &&
      latestDecision.address2dFingerprint !== parsedAddressFingerprint(parsed)
    const lastDecision = fixture.decisions
      .filter(
        item =>
          item.placeId === observation.placeId &&
          (item.fingerprint === fingerprint ||
            (item.resolution === 'leave_unlinked' &&
              item.address2dFingerprint === parsedAddressFingerprint(parsed))) &&
          item.sourceRelease <= observation.sourceRelease,
      )
      .sort((a, b) => b.sourceRelease.localeCompare(a.sourceRelease))[0]
    const replayGeometryOverride =
      lastDecision?.placeGeometryOverride && lastDecision.fingerprint === fingerprint
        ? lastDecision.placeGeometryOverride
        : undefined
    if (
      lastDecision?.resolution === 'leave_unlinked' &&
      latestDecision === lastDecision &&
      (!entry || entry.firstSeen <= lastDecision.sourceRelease)
    ) {
      return result(
        'delayed',
        null,
        'explicit_retirement',
        [],
        undefined,
        replayGeometryOverride,
      )
    }
    if (lastDecision?.addressId && officialIds.has(lastDecision.addressId)) {
      return result(
        'direct',
        lastDecision.addressId,
        'recorded_decision',
        [],
        undefined,
        replayGeometryOverride,
      )
    }
    if (previous?.fingerprint === fingerprint && officialIds.has(previous.addressId)) {
      return result('direct', previous.addressId, 'previous_relationship')
    }
    if (
      entry &&
      reproducible(entry) &&
      (!previous || previous.addressId === entry.addressId)
    ) {
      return result(
        'supplementary',
        entry.addressId,
        'accepted_curation',
        [],
        entry,
        replayGeometryOverride,
      )
    }

    const candidatesById = new Map<string, Candidate>()
    for (const item of parsed) {
      const candidateDefinitions = new Set(
        matcher.componentsByLongestName
          .filter(component =>
            item.recognised2dComponents.some(
              found =>
                found.kind === component.kind &&
                found.normalisedName === component.normalisedName,
            ),
          )
          .flatMap(component => component.definitions),
      )
      // Street evidence may create review candidates, but bare numbers and geometry cannot.
      if (item.street)
        for (const definition of byStreet.get(item.street.normalisedName) ?? [])
          candidateDefinitions.add(definition)
      const aliases = policy.aliases.filter(alias =>
        contains(item.normalisedAddress2dText, normaliseAddressText(alias.text)),
      )
      for (const alias of aliases)
        for (const definition of byId.get(alias.addressId) ?? [])
          candidateDefinitions.add(definition)
      for (const definition of candidateDefinitions) {
        if (!officialIds.has(definition.addressId)) continue
        const breakdown: Record<string, number> = {}
        const contradictions: string[] = []
        const componentsByKind = Map.groupBy(
          item.recognised2dComponents,
          component => component.kind,
        )
        for (const [kind, components] of componentsByKind) {
          const canonical = definition[kind]
          if (!canonical) {
            if (kind !== 'estateName') contradictions.push(kind)
            continue
          }
          if (
            components.every(
              component => normaliseAddressText(canonical) === component.normalisedName,
            )
          )
            breakdown[kind] = policy.weights[kind]
          else contradictions.push(kind)
        }
        if (item.street) {
          if (item.street.normalisedName === definition.normalisedStreetName)
            breakdown.street = policy.weights.street
          else if (definition.normalisedStreetName) contradictions.push('street')
        }
        if (item.buildingNumbers.length && definition.buildingNumbers.length) {
          if (
            item.buildingNumbers.every(number =>
              definition.buildingNumbers.includes(number),
            )
          )
            breakdown.number = policy.weights.number
          else contradictions.push('number')
        }
        if (
          aliases.some(
            alias =>
              alias.addressId === definition.addressId &&
              alias.locale === definition.locale,
          )
        )
          breakdown.alias = policy.weights.alias
        const point = geometry.get(definition.addressId)
        const candidate: Candidate = {
          addressId: definition.addressId,
          breakdown,
          contradictions,
          score: Object.values(breakdown).reduce((a, b) => a + b, 0),
          distanceMetres: point ? distance(observation, point) : null,
          parsed: item,
          locale: definition.locale,
        }
        const existing = candidatesById.get(candidate.addressId)
        if (!existing || candidate.score > existing.score)
          candidatesById.set(candidate.addressId, candidate)
      }
    }
    const candidates = [...candidatesById.values()]
    const namedCandidates = candidates.filter(candidate =>
      ['buildingName', 'estateName', 'alias'].some(key => candidate.breakdown[key]),
    )
    const named = namedCandidates
      .filter(
        (candidate): candidate is Candidate & { distanceMetres: number } =>
          candidate.distanceMetres !== null,
      )
      .sort((a, b) => a.distanceMetres - b.distanceMetres)
    const nearest = named[0]
    if (
      nearest &&
      named.length === namedCandidates.length &&
      nearest.distanceMetres <= policy.distanceMetres &&
      (!named[1] ||
        named[1].distanceMetres - nearest.distanceMetres >= policy.distanceMarginMetres)
    ) {
      nearest.breakdown.geometry = policy.weights.geometry
      nearest.score += policy.weights.geometry
    }
    candidates.sort(
      (a, b) => b.score - a.score || a.addressId.localeCompare(b.addressId),
    )
    if (retiredAddressChanged)
      return result('review', null, 'unlinked_address_changed', candidates)
    if (entry || previous) return result('review', null, 'identity_drift', candidates)
    const exactIds = new Set(
      parsed.flatMap(item => [
        ...(matcher.byExactText.get(item.normalisedAddress2dText) ?? []),
      ]),
    )
    const premiseCandidates = candidates.filter(hasPremiseIdentityEvidence)
    const best = premiseCandidates[0]
    // Evaluate separation before excluding conflicting or distant rivals.
    const automaticRejection = (candidate: Candidate) => {
      if (candidate.contradictions.length) return 'contradictory_components'
      if (
        candidate.distanceMetres === null ||
        !Number.isFinite(candidate.distanceMetres) ||
        candidate.distanceMetres > Math.min(50, policy.distanceMetres)
      )
        return 'outside_proximity_allowance'
      const rival = candidates.find(other => other.addressId !== candidate.addressId)
      if (rival && candidate.score - rival.score < Math.max(20, policy.separation))
        return 'multiple_close_matches'
      return null
    }
    if (exactIds.size > 1)
      return result(
        'review',
        null,
        'ambiguous_exact_addresses',
        candidates.filter(candidate => exactIds.has(candidate.addressId)),
      )
    if (
      exactIds.size === 1 &&
      !candidates.some(candidate => candidate.contradictions.length)
    ) {
      const exactId = [...exactIds][0]
      const exact = candidates.find(candidate => candidate.addressId === exactId)
      if (exact) {
        const rejection = automaticRejection(exact)
        if (rejection) return result('review', null, rejection, candidates)
        return result('direct', exact.addressId, 'exact_formatted_address', candidates)
      }
    }
    // Residual premise text is never silently discarded to make an ALS link.
    const canonical = candidates.filter(
      candidate =>
        !candidate.contradictions.length &&
        !candidate.parsed.unclassified2dText &&
        candidate.breakdown.street &&
        ['buildingName', 'estateName', 'blockExpression', 'phaseExpression'].some(
          key => candidate.breakdown[key],
        ),
    )
    if (canonical.length === 1 && canonical[0]) {
      const rejection = automaticRejection(canonical[0])
      if (rejection) return result('review', null, rejection, candidates)
      return result(
        'direct',
        canonical[0].addressId,
        'canonical_components',
        candidates,
      )
    }
    if (!best || best.score < policy.reviewThreshold)
      return result('delayed', null, 'no_useful_partial_match', candidates)
    // A weak partial match is evidence for a future matcher, not enough evidence
    // to ask a reviewer to choose an Address identity. Only candidates which
    // independently clear the automatic threshold can become review work because
    // of contradictory evidence or insufficient separation.
    if (best.score < policy.automaticThreshold)
      return result('delayed', null, 'below_automatic_threshold', candidates)
    const rejection = automaticRejection(best)
    if (rejection) return result('review', null, rejection, candidates)
    if (
      best.contradictions.length ||
      (premiseCandidates[1] &&
        best.score - premiseCandidates[1].score < policy.separation)
    ) {
      return result(
        'review',
        null,
        best.contradictions.length
          ? 'contradictory_components'
          : 'multiple_close_matches',
        premiseCandidates,
      )
    }
    // Multiple publisher localisations require a reviewer to establish their shared identity.
    if (parsed.length !== 1)
      return result('review', null, 'multiple_address_localisations', premiseCandidates)
    const value = best.parsed
    const supplementaryBuilding = supplementaryBuildingName(value)
    const values: SupplementaryValues[] = [
      {
        locale: /\p{Script=Han}/u.test(value.address2dText) ? 'zh-hant' : 'en',
        formattedAddress: value.address2dText,
        buildingName: supplementaryBuilding || null,
        estateName:
          value.recognised2dComponents.find(item => item.kind === 'estateName')?.name ??
          null,
        blockExpression:
          value.recognised2dComponents.find(item => item.kind === 'blockExpression')
            ?.name ?? null,
        phaseExpression:
          value.recognised2dComponents.find(item => item.kind === 'phaseExpression')
            ?.name ?? null,
        streetName: value.street?.name ?? null,
        buildingNumberExpression: value.buildingNumberExpression,
        buildingNumberFrom: value.buildingNumbers[0] ?? null,
        buildingNumberTo:
          value.buildingNumbers.length > 1
            ? (value.buildingNumbers.at(-1) ?? null)
            : null,
      },
    ]
    const accepted: SupplementaryEntry = {
      placeId: observation.placeId,
      ...supplementaryIdentity(values),
      fingerprint,
      normalisedPublisherAddress: observation.texts.map(normaliseAddressText),
      baseAddressId: best.addressId,
      values,
      policyVersion: fixture.activePolicy,
      score: best.score,
      evidence: [candidateEvidence(best)],
      acceptanceMode: 'automatic',
      firstSeen: observation.sourceRelease,
    }
    const shared = fixture.entries.find(
      item => item.identityKey === accepted.identityKey && !item.revokedAt,
    )
    if (shared) {
      if (shared.baseAddressId !== accepted.baseAddressId)
        return result('review', null, 'shared_address_base_drift', premiseCandidates)
      accepted.values = shared.values
    }
    fixture.entries.push(accepted)
    byPlace.set(observation.placeId, [accepted])
    return result(
      'supplementary',
      accepted.addressId,
      'automatic_threshold',
      candidates,
      accepted,
    )
  }
}

function hasPremiseIdentityEvidence(candidate: Candidate) {
  if (candidate.breakdown.alias) return true
  return (
    Boolean(candidate.breakdown.street) &&
    ['buildingName', 'estateName', 'blockExpression', 'phaseExpression'].some(
      key => candidate.breakdown[key],
    )
  )
}

function candidateEvidence(candidate: Candidate): CandidateEvidence {
  const { parsed: _parsed, ...evidence } = candidate
  return evidence
}

/**
 * A supplementary building name comes from the premise side of the street, not
 * from every residual token in the address.  The latter would turn trailing
 * localities and a street-number introducer ("No.") into building text.
 */
function supplementaryBuildingName(value: ParsedPlaceAddress) {
  const building = value.recognised2dComponents.find(
    item => item.kind === 'buildingName',
  )
  const streetStart = value.street
    ? value.normalisedAddress2dText.indexOf(value.street.normalisedName)
    : -1
  const buildingStart = building
    ? value.normalisedAddress2dText.indexOf(building.normalisedName)
    : -1

  // Hong Kong addresses may put the building after the street and number. In
  // that form, retain the authoritative matched building rather than the
  // locality before the street.
  if (building && streetStart >= 0 && buildingStart >= streetStart)
    return building.normalisedName

  let candidate =
    streetStart >= 0
      ? value.normalisedAddress2dText.slice(0, streetStart)
      : value.normalisedAddress2dText
  for (const component of value.recognised2dComponents.filter(
    item => item.kind !== 'buildingName',
  ))
    candidate = candidate.replace(component.normalisedName, '')
  candidate = removeStreetNumberIntroducer(candidate, value.buildingNumberExpression)
  candidate = candidate.replace(/\s+/g, ' ').trim()
  return candidate || building?.normalisedName || null
}

function removeStreetNumberIntroducer(
  value: string,
  buildingNumberExpression: string | null,
) {
  if (!buildingNumberExpression) return value
  const number = normaliseAddressText(buildingNumberExpression).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  )
  return value
    .replace(new RegExp(`(?:^|\\s)NO\\s+${number}\\s*$`, 'u'), ' ')
    .replace(new RegExp(`(?:^|\\s)${number}\\s*$`, 'u'), ' ')
}

function contains(text: string, component: string) {
  return (
    ` ${text} `.includes(` ${component} `) ||
    (/\p{Script=Han}/u.test(component) && text.includes(component))
  )
}
function distance(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const radians = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * radians) / 2) ** 2 +
    Math.cos(a.lat * radians) *
      Math.cos(b.lat * radians) *
      Math.sin(((b.lng - a.lng) * radians) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
