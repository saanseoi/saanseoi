import identityFixture from '../../../../../../fixtures/meta/processing-rules/assembly/place-identity.json'
import { ruleDeclarationFromFixture } from '../../../provenance'
import { buildDeterministicUuidV5, canonicalGeneratedId } from '@repo/db'

export const placeIdentityDeclaration = ruleDeclarationFromFixture(identityFixture)
export const PLACE_IDENTITY_MODEL = identityFixture.parameters.model
export const PLACE_IDENTITY_THRESHOLD = identityFixture.parameters.minimumScore
export const PLACE_IDENTITY_MARGIN = identityFixture.parameters.minimumMargin

/** Scores are policy scores, not calibrated probabilities. Missing evidence is unknown. */
export type PlaceIdentityEvidence = {
  sourceId: string
  names: string[]
  phones: string[]
  socials: string[]
  websites: string[]
  emails: string[]
  attribution: string[]
  category: string | null
  hours: string | null
  addresses: string[]
  units: string[]
  floors: string[]
  lng: number
  lat: number
}
export type PlaceIdentityCandidate = {
  id: string
  evidence: PlaceIdentityEvidence
  release?: string
}
export type PlaceIdentityScore = {
  evidence: PlaceIdentityEvidence
  release: string | null
  id: string
  score: number
  distanceMetres: number
  agreements: string[]
  conflicts: string[]
  rebrand: boolean
  eligible: boolean
}
export type PlaceIdentityDecision = {
  model: string
  sourceRelease: string
  threshold: number
  requiredMargin: number
  alternativeMargin: number | null
  rivalMargin: number | null
  rivals: { sourceId: string; score: number }[]
  id: string
  sourceId: string
  outcome: 'matched' | 'new'
  reason:
    | 'continuity'
    | 'rebrand'
    | 'no-candidate'
    | 'insufficient-evidence'
    | 'ambiguous'
  evidence: PlaceIdentityEvidence
  candidates: PlaceIdentityScore[]
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const strings = (v: unknown) =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string')
const text = (v: unknown) =>
  typeof v === 'string'
    ? v.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
    : ''
const unique = (v: string[]) => [...new Set(v.filter(Boolean))].sort()
function phone(v: string) {
  const n = v.replace(/[\s().-]/g, '')
  if (/^(?:\+852|00852)?[2-9]\d{7}$/.test(n)) return `+852${n.slice(-8)}`
  return /^\+\d{7,15}$/.test(n) ? n : ''
}
function url(v: string) {
  try {
    const u = new URL(v.includes('://') ? v : `https://${v}`)
    // Preserve path and meaningful query IDs; only transport/www/trailing slash are cosmetic.
    for (const key of [...u.searchParams.keys()])
      if (key.startsWith('utm_')) u.searchParams.delete(key)
    u.searchParams.sort()
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`
  } catch {
    return ''
  }
}
function stable(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify(v.map(stable).sort())
  if (v && typeof v === 'object')
    return JSON.stringify(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, stable(x)]),
    )
  return JSON.stringify(v) ?? ''
}
export function placeIdentityEvidence(
  row: Record<string, unknown>,
  lng: number,
  lat: number,
): PlaceIdentityEvidence {
  if (
    typeof row.id !== 'string' ||
    !row.id ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  )
    throw new Error('Invalid Place identity evidence.')
  const names = obj(row.names)
  const hours = row.opening_hours ?? row.openingHours
  const addressText = (Array.isArray(row.addresses) ? row.addresses : [])
    .map(x => text(obj(x).freeform))
    .join(' ')
  const units = [
    ...addressText.matchAll(
      /\b(?:shop|unit|room|suite)\s*[:#-]?\s*([a-z]?\d+[a-z]?|[a-z])\b/g,
    ),
    ...addressText.matchAll(/([a-z]?\d+[a-z]?)\s*(?:室|號舖|號鋪)/g),
  ].map(x => x[1]!)
  const floors = [
    ...addressText.matchAll(/\b([bg]?\d*|ug|lg)\s*\/\s*f\b/g),
    ...addressText.matchAll(/(\d+)\s*樓/g),
  ]
    .map(x => x[1]!)
    .filter(Boolean)
  return {
    sourceId: row.id,
    names: unique([text(names.primary), ...Object.values(obj(names.common)).map(text)]),
    phones: unique(strings(row.phones).map(phone)),
    socials: unique(strings(row.socials).map(url)),
    websites: unique(strings(row.websites).map(url)),
    emails: unique(strings(row.emails).map(text)),
    attribution: unique(
      (Array.isArray(row.sources) ? row.sources : []).flatMap(value => {
        const s = obj(value)
        const id = s.record_id ?? s.recordId
        return typeof s.dataset === 'string' && typeof id === 'string' && id.trim()
          ? [JSON.stringify([s.dataset, id])]
          : []
      }),
    ),
    category: text(obj(row.taxonomy).primary ?? obj(row.categories).primary) || null,
    hours:
      hours == null || hours === '' || (Array.isArray(hours) && !hours.length)
        ? null
        : stable(hours),
    addresses: unique(
      (Array.isArray(row.addresses) ? row.addresses : []).map(x =>
        text(obj(x).freeform),
      ),
    ),
    units: unique(units),
    floors: unique(floors),
    lng,
    lat,
  }
}
const overlaps = (a: string[], b: string[]) => a.some(x => b.includes(x))
export function scorePlaceIdentity(
  a: PlaceIdentityEvidence,
  b: PlaceIdentityCandidate,
): PlaceIdentityScore {
  const p = b.evidence
  const radians = Math.PI / 180
  const dy = (a.lat - p.lat) * radians
  const dx = (a.lng - p.lng) * radians
  const distanceMetres =
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dy / 2) ** 2 +
            Math.cos(a.lat * radians) *
              Math.cos(p.lat * radians) *
              Math.sin(dx / 2) ** 2,
        ),
      ),
    )
  const agreements: string[] = []
  const conflicts: string[] = []
  let score = 0
  const add = (key: string, yes: boolean, weight: number) => {
    if (yes) {
      agreements.push(key)
      score += weight
    }
  }
  add('source-id', a.sourceId === p.sourceId, 75)
  for (const [key, weight] of [
    ['attribution', 45],
    ['phones', 35],
    ['socials', 35],
    ['websites', 20],
    ['emails', 30],
    ['names', 25],
    ['addresses', 10],
  ] as const) {
    const same = overlaps(a[key], p[key])
    add(key, same, weight)
    if (a[key].length && p[key].length && !same) conflicts.push(key)
  }
  add('category', !!a.category && a.category === p.category, 10)
  if (a.category && p.category && a.category !== p.category) conflicts.push('category')
  add('hours', !!a.hours && a.hours === p.hours, 10)
  if (a.hours && p.hours && a.hours !== p.hours) conflicts.push('hours')
  add(
    'location',
    distanceMetres <= identityFixture.parameters.rebrandMaximumDistanceMetres,
    20,
  )
  if (distanceMetres > identityFixture.parameters.maximumDistanceMetres)
    conflicts.push('location')
  for (const key of ['units', 'floors'] as const)
    if (a[key].length && p[key].length && !overlaps(a[key], p[key])) conflicts.push(key)
  const rebrand = conflicts.includes('names')
  const has = (key: string) => agreements.includes(key)
  const anchor =
    has('source-id') ||
    has('attribution') ||
    has('phones') ||
    has('socials') ||
    has('emails')
  // A rebrand must preserve known ancillary evidence. A name/location collision is never enough.
  const rebrandSupported =
    has('phones') &&
    JSON.stringify(a.phones) === JSON.stringify(p.phones) &&
    has('category') &&
    distanceMetres <= identityFixture.parameters.rebrandMaximumDistanceMetres &&
    ['attribution', 'socials', 'emails', 'websites', 'hours'].some(has) &&
    !['phones', 'category', 'hours', 'socials', 'websites', 'emails', 'addresses'].some(
      x => conflicts.includes(x),
    )
  const continuity = has('source-id') || (has('names') && anchor) || rebrandSupported
  const eligible =
    distanceMetres <= identityFixture.parameters.maximumDistanceMetres &&
    !conflicts.includes('units') &&
    !conflicts.includes('floors') &&
    anchor &&
    continuity &&
    (!rebrand || rebrandSupported) &&
    !(conflicts.includes('phones') && conflicts.includes('category'))
  return {
    id: b.id,
    evidence: p,
    release: b.release ?? null,
    score,
    distanceMetres: Math.round(distanceMetres * 100) / 100,
    agreements,
    conflicts,
    rebrand,
    eligible,
  }
}

/** Global one-to-one matching: ties and competing observations abstain; input order has no effect. */
export function matchPlaceIdentities(
  incoming: PlaceIdentityEvidence[],
  previous: PlaceIdentityCandidate[],
  scope: string,
  sourceVersion: string,
) {
  const index = new Map<string, Set<number>>()
  const keys = (p: PlaceIdentityEvidence) => [
    `id:${p.sourceId}`,
    ...(['attribution', 'phones', 'socials', 'emails'] as const).flatMap(key =>
      p[key].map(v => `${key}:${v}`),
    ),
  ]
  const priorIds = new Set<string>()
  previous.forEach((p, i) => {
    if (priorIds.has(p.id))
      throw new Error(`Duplicate canonical Place identity ${p.id}.`)
    priorIds.add(p.id)
    for (const key of keys(p.evidence)) {
      const values = index.get(key) ?? new Set<number>()
      values.add(i)
      index.set(key, values)
    }
  })
  const seen = new Set<string>()
  const scored = incoming.map(p => {
    if (seen.has(p.sourceId))
      throw new Error(`Duplicate publisher Place identity ${p.sourceId}.`)
    seen.add(p.sourceId)
    const candidates = new Set<number>()
    for (const key of keys(p)) for (const i of index.get(key) ?? []) candidates.add(i)
    return [...candidates]
      .map(i => scorePlaceIdentity(p, previous[i]!))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  })
  const claims = new Map<string, { index: number; score: number }[]>()
  scored.forEach((rows, index) => {
    // All plausible claimants count, including a runner-up for another record.
    for (const row of rows.filter(
      x => x.eligible && x.score >= PLACE_IDENTITY_THRESHOLD,
    )) {
      const values = claims.get(row.id) ?? []
      values.push({ index, score: row.score })
      claims.set(row.id, values)
    }
  })
  const allocated = new Set<string>()
  return incoming.map((evidence, i): PlaceIdentityDecision => {
    const candidates = scored[i]!
    const eligible = candidates.filter(
      x => x.eligible && x.score >= PLACE_IDENTITY_THRESHOLD,
    )
    const best = eligible[0]
    const alternatives = candidates.filter(x => x.eligible && x.id !== best?.id)
    const rivals = best ? (claims.get(best.id) ?? []).filter(x => x.index !== i) : []
    const ambiguous =
      !!best &&
      ((alternatives[0]?.score ?? 0) > best.score - PLACE_IDENTITY_MARGIN ||
        rivals.some(x => x.score > best.score - PLACE_IDENTITY_MARGIN))
    const matched = best && !ambiguous
    const id = matched
      ? best.id
      : canonicalGeneratedId(
          buildDeterministicUuidV5(
            '923607ac-5c99-5f71-8b7c-37f960ed6071',
            stable([scope, sourceVersion, evidence]),
          ),
        )
    if (allocated.has(id) || (!matched && priorIds.has(id)))
      throw new Error(`Place identity allocation collision ${id}.`)
    allocated.add(id)
    return {
      model: PLACE_IDENTITY_MODEL,
      sourceRelease: sourceVersion,
      threshold: PLACE_IDENTITY_THRESHOLD,
      requiredMargin: PLACE_IDENTITY_MARGIN,
      alternativeMargin:
        best && alternatives.length ? best.score - alternatives[0]!.score : null,
      rivalMargin:
        best && rivals.length
          ? best.score - Math.max(...rivals.map(x => x.score))
          : null,
      rivals: rivals
        .sort(
          (a, b) =>
            b.score - a.score ||
            incoming[a.index]!.sourceId.localeCompare(incoming[b.index]!.sourceId),
        )
        .slice(0, 5)
        .map(x => ({ sourceId: incoming[x.index]!.sourceId, score: x.score })),
      id,
      sourceId: evidence.sourceId,
      outcome: matched ? 'matched' : 'new',
      reason: matched
        ? best.rebrand
          ? 'rebrand'
          : 'continuity'
        : ambiguous
          ? 'ambiguous'
          : candidates.length
            ? 'insufficient-evidence'
            : 'no-candidate',
      evidence,
      candidates: (best
        ? [best, ...candidates.filter(candidate => candidate !== best)]
        : candidates
      ).slice(0, 5),
    }
  })
}
