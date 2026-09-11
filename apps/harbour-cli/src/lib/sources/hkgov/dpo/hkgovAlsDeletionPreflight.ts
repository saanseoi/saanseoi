import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  alsMembershipHash,
  readAlsMembership,
  validateAlsMembership,
  type AlsMembership,
  type AlsMembershipAddress,
} from './hkgovAlsMembership'

export { readAlsMembership } from './hkgovAlsMembership'
export type { AlsMembership, AlsMembershipReference } from './hkgovAlsMembership'
const root = resolve(import.meta.dir, '../../../../../../..')
export const ALS_DELETION_REVIEWS_FILE = resolve(
  root,
  '.local/hkgov-dpo/deletion-reviews.json',
)
export const ALS_DELETION_REPORT_DIRECTORY = resolve(root, '.local/hkgov-dpo/deletions')
export const ALS_DELETION_POLICY = {
  minimumSpikeCount: 100,
  spikePercentage: 5,
  absoluteSpikeCount: 1000,
  reviewedLevels: ['building', 'complex', 'phase', 'site', 'section'],
} as const
type AddressSummary = Pick<AlsMembershipAddress, 'id' | 'level' | 'en' | 'zhHant'>
type Retirement = AddressSummary & {
  parentId: string | null
  parentChain: AddressSummary[]
  mapUrl: string | null
  descendantAddresses: number
  descendantUnits: number
}
type Group = {
  previousCount: number
  removedCount: number
  removedPercentage: number
  retirements: Retirement[]
}

export function buildAlsDeletionReport(
  previous: AlsMembership | null,
  current: AlsMembership,
) {
  validateAlsMembership(current)
  if (previous) {
    validateAlsMembership(previous)
    if (previous.sourceVersion >= current.sourceVersion)
      throw new Error(
        'ALS deletion preflight requires the immediate earlier source release.',
      )
  }
  const previousAddresses = new Map(
    previous?.addresses.map(address => [address.id, address]),
  )
  const currentAddresses = new Map(
    current.addresses.map(address => [address.id, address]),
  )
  const currentUnits = new Set(
    current.collections.flatMap(collection => collection.units.map(([id]) => id)),
  )
  const aliases = new Map(current.aliases)
  const resolveId = (id: string) => {
    const seen = new Set<string>()
    while (aliases.has(id)) {
      if (seen.has(id)) throw new Error(`ALS alias cycle at ${id}.`)
      seen.add(id)
      id = aliases.get(id)!
    }
    return id
  }
  const summary = (row: AlsMembershipAddress): AddressSummary => ({
    id: row.id,
    level: row.level,
    en: row.en,
    zhHant: row.zhHant,
  })
  const chain = (id: string | null) => {
    const result: AddressSummary[] = []
    while (id) {
      const row = previousAddresses.get(id)
      if (!row) throw new Error(`ALS missing predecessor parent ${id}.`)
      result.push(summary(row))
      id = row.parentId
    }
    return result
  }
  const mapUrl = (row: AlsMembershipAddress | undefined) =>
    row?.coordinates
      ? `https://www.openstreetmap.org/?mlat=${row.coordinates[1]}&mlon=${row.coordinates[0]}#map=19/${row.coordinates[1]}/${row.coordinates[0]}`
      : null
  const descendants = new Map<string, { addresses: number; units: number }>()
  const addDescendants = (id: string | null, addresses: number, units: number) => {
    while (id) {
      const counts = descendants.get(id) ?? { addresses: 0, units: 0 }
      counts.addresses += addresses
      counts.units += units
      descendants.set(id, counts)
      id = previousAddresses.get(id)?.parentId ?? null
    }
  }
  for (const row of previousAddresses.values()) addDescendants(row.parentId, 1, 0)
  for (const collection of previous?.collections ?? [])
    addDescendants(collection.ownerId, 0, collection.units.length)
  const groups: Record<string, Group> = {}
  const group = (level: string) =>
    (groups[level] ??= {
      previousCount: 0,
      removedCount: 0,
      removedPercentage: 0,
      retirements: [],
    })
  const aliasReplacements: Array<{
    previous: AddressSummary
    current: AddressSummary
  }> = []
  for (const row of previousAddresses.values()) {
    const level = group(row.level)
    level.previousCount++
    if (currentAddresses.has(row.id)) continue
    const replacement = currentAddresses.get(resolveId(row.id))
    if (replacement) {
      aliasReplacements.push({ previous: summary(row), current: summary(replacement) })
      continue
    }
    const affected = descendants.get(row.id)
    level.retirements.push({
      ...summary(row),
      parentId: row.parentId,
      parentChain: chain(row.parentId),
      mapUrl: mapUrl(row),
      descendantAddresses: affected?.addresses ?? 0,
      descendantUnits: affected?.units ?? 0,
    })
  }
  const wholeInventoryLosses: Array<{
    collectionId: string
    owner: AddressSummary
    previousCount: number
    removedCount: number
    mapUrl: string | null
  }> = []
  for (const collection of previous?.collections ?? []) {
    const owner = previousAddresses.get(collection.ownerId)!
    group('unit').previousCount += collection.units.length
    let removed = 0
    for (const [id, , , en, zhHant] of collection.units) {
      // Unit identity belongs to the physical building: an owner move is not deletion.
      if (currentUnits.has(id)) continue
      removed++
      group('unit').retirements.push({
        id,
        level: 'unit',
        en,
        zhHant,
        parentId: owner.id,
        parentChain: chain(owner.id),
        mapUrl: mapUrl(owner),
        descendantAddresses: 0,
        descendantUnits: 0,
      })
    }
    if (removed > 0 && removed === collection.units.length)
      wholeInventoryLosses.push({
        collectionId: collection.id,
        owner: summary(owner),
        previousCount: collection.units.length,
        removedCount: removed,
        mapUrl: mapUrl(owner),
      })
  }
  const suspicious: Array<{
    reason: string
    level?: string
    count: number
    ids?: string[]
  }> = []
  for (const [level, value] of Object.entries(groups).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    value.retirements.sort((a, b) => a.id.localeCompare(b.id))
    value.removedCount = value.retirements.length
    value.removedPercentage = value.previousCount
      ? (value.removedCount / value.previousCount) * 100
      : 0
    if (
      value.removedCount &&
      (ALS_DELETION_POLICY.reviewedLevels as readonly string[]).includes(level)
    )
      suspicious.push({
        reason: 'premise_retirement',
        level,
        count: value.removedCount,
        ids: value.retirements.map(row => row.id),
      })
    if (
      (value.removedCount >= ALS_DELETION_POLICY.minimumSpikeCount &&
        value.removedPercentage >= ALS_DELETION_POLICY.spikePercentage) ||
      value.removedCount >= ALS_DELETION_POLICY.absoluteSpikeCount
    )
      suspicious.push({ reason: 'deletion_spike', level, count: value.removedCount })
  }
  if (wholeInventoryLosses.length)
    suspicious.push({
      reason: 'whole_inventory_loss',
      count: wholeInventoryLosses.length,
      ids: wholeInventoryLosses.map(value => value.collectionId),
    })
  const currentSources = new Map(current.sources.map(source => [source.id, source]))
  const currentSourceUnits = new Map(
    current.sources
      .filter(source => source.kind === '3d')
      .map(source => [source.id, new Set(source.units)]),
  )
  const supportingSources = new Map<string, string[]>()
  for (const source of current.sources)
    for (const id of source.canonicalIds)
      supportingSources.set(id, [...(supportingSources.get(id) ?? []), source.id])
  const rawSourceOmissions: Array<{
    id: string
    kind: string
    previousCanonicalIds: string[]
    retainedCanonicalIds: string[]
    disposition: string
    retentionEvidence: Array<{ id: string; sourceIds: string[]; curations: string[] }>
  }> = []
  const retainedPublisherUnitOmissions: Array<{
    sourceId: string
    ownerId: string
    unitTokens: string[]
    curations: string[]
    disposition: 'remaining_source_or_alias' | 'curation_retention'
    supportingSourceIds: string[]
  }> = []
  const currentTokensByOwner = new Map<string, Set<string>>()
  for (const collection of current.collections)
    currentTokensByOwner.set(
      collection.ownerId,
      new Set(collection.units.map(([, floor, unit]) => JSON.stringify([floor, unit]))),
    )
  for (const source of previous?.sources ?? []) {
    const next = currentSources.get(source.id)
    const retainedCanonicalIds = [
      ...new Set(
        source.canonicalIds.map(resolveId).filter(id => currentAddresses.has(id)),
      ),
    ].sort()
    const retentionEvidence = retainedCanonicalIds.map(id => ({
      id,
      sourceIds: supportingSources.get(id) ?? [],
      curations: currentAddresses.get(id)?.curations ?? [],
    }))
    if (!next)
      rawSourceOmissions.push({
        id: source.id,
        kind: source.kind,
        previousCanonicalIds: source.canonicalIds,
        retainedCanonicalIds,
        retentionEvidence,
        disposition: !source.canonicalIds.length
          ? 'unresolved_or_suppressed_source'
          : !retainedCanonicalIds.length
            ? 'canonical_retirement'
            : retentionEvidence.some(value => value.sourceIds.length > 0)
              ? 'remaining_source_or_alias'
              : 'curation_retention',
      })
    if (source.kind !== '3d') continue
    const nextTokens = new Set(next?.units ?? [])
    // Reparented inventory can retain the same raw assertion and enduring units.
    for (const ownerId of [
      ...new Set([...retainedCanonicalIds, ...(next?.canonicalIds ?? [])]),
    ].sort()) {
      const finalTokens = currentTokensByOwner.get(ownerId)
      const unitTokens =
        source.units?.filter(
          token => !nextTokens.has(token) && finalTokens?.has(token),
        ) ?? []
      const byDisposition = new Map<
        'remaining_source_or_alias' | 'curation_retention',
        { tokens: string[]; sources: Set<string> }
      >()
      for (const token of unitTokens) {
        const supporting = (supportingSources.get(ownerId) ?? []).filter(id =>
          currentSourceUnits.get(id)?.has(token),
        )
        const disposition = supporting.length
          ? 'remaining_source_or_alias'
          : 'curation_retention'
        const group = byDisposition.get(disposition) ?? {
          tokens: [],
          sources: new Set<string>(),
        }
        group.tokens.push(token)
        for (const id of supporting) group.sources.add(id)
        byDisposition.set(disposition, group)
      }
      for (const [disposition, group] of byDisposition)
        retainedPublisherUnitOmissions.push({
          sourceId: source.id,
          ownerId,
          unitTokens: group.tokens,
          disposition,
          supportingSourceIds: [...group.sources].sort(),
          curations:
            current.collections.find(collection => collection.ownerId === ownerId)
              ?.curations ?? [],
        })
    }
  }
  const report = {
    schemaVersion: 1 as const,
    previousSourceVersion: previous?.sourceVersion ?? null,
    sourceVersion: current.sourceVersion,
    // Output container hashes differ between output-free preflight and preparation.
    // Approval covers the exact resolved membership and policy, independently of paths.
    previousMembershipSha256: previous
      ? alsMembershipHash({
          ...previous,
          preparedSha256: undefined,
          address3dSha256: undefined,
        })
      : null,
    membershipSha256: alsMembershipHash({
      ...current,
      preparedSha256: undefined,
      address3dSha256: undefined,
    }),
    policy: ALS_DELETION_POLICY,
    groups: Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)),
    ),
    wholeInventoryLosses,
    aliasReplacements,
    rawSourceOmissions,
    retainedPublisherUnitOmissions,
    suspicious,
  }
  return {
    ...report,
    digest: alsMembershipHash(report),
    requiresReview: suspicious.length > 0,
  }
}
export type AlsDeletionReport = ReturnType<typeof buildAlsDeletionReport>

export function hasAlsDeletionReview(report: AlsDeletionReport, value: unknown) {
  if (!value || typeof value !== 'object') return false
  const approvals = value as { schemaVersion?: unknown; reviews?: unknown }
  if (approvals.schemaVersion !== 1 || !Array.isArray(approvals.reviews)) return false
  return approvals.reviews.some(
    review =>
      review &&
      typeof review === 'object' &&
      review.digest === report.digest &&
      review.sourceVersion === report.sourceVersion &&
      review.previousSourceVersion === report.previousSourceVersion &&
      typeof review.reason === 'string' &&
      review.reason.trim() &&
      typeof review.reviewedAt === 'string' &&
      Number.isFinite(Date.parse(review.reviewedAt)),
  )
}

export async function reviewAlsDeletions(input: {
  previous: AlsMembership | null
  current: AlsMembership
  reportFile: string
  approvalsFile?: string
}) {
  const report = buildAlsDeletionReport(input.previous, input.current)
  await mkdir(dirname(input.reportFile), { recursive: true })
  await writeFile(input.reportFile, JSON.stringify(report, null, 2))
  const approvalsFile = input.approvalsFile ?? ALS_DELETION_REVIEWS_FILE
  const approvals = await readFile(approvalsFile, 'utf8')
    .then(JSON.parse)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  if (report.requiresReview && !hasAlsDeletionReview(report, approvals))
    throw new Error(
      [
        `ALS deletions require review for ${report.sourceVersion}.`,
        `Review JSON: ${input.reportFile}`,
        `Digest: ${report.digest}`,
        `After reviewing or correcting curations, record the exact digest, previousSourceVersion, sourceVersion, reason and reviewedAt in ${approvalsFile} ({"schemaVersion":1,"reviews":[...]}).`,
        '--yes and --skip-curation-checks cannot approve deletions.',
      ].join('\n'),
    )
  return report
}

async function fileHash(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Call before any delivery writes, supplying the acknowledged immediate predecessor. */
export async function assertPreparedAlsDeletionReview(input: {
  preparedFile: string
  sourceVersion: string
  previousMembershipFile?: string
  reportFile?: string
  approvalsFile?: string
}) {
  const current = await readAlsMembership(`${input.preparedFile}.membership.json`)
  if (current.sourceVersion !== input.sourceVersion)
    throw new Error('ALS membership source version does not match the upload.')
  if (
    !current.preparedSha256 ||
    !current.address3dSha256 ||
    current.preparedSha256 !== (await fileHash(input.preparedFile)) ||
    current.address3dSha256 !==
      (await fileHash(`${input.preparedFile}.address3d.jsonl`))
  )
    throw new Error(
      'ALS prepared files changed after membership preflight; prepare the release again.',
    )
  const previous = input.previousMembershipFile
    ? await readAlsMembership(input.previousMembershipFile)
    : null
  await reviewAlsDeletions({
    previous,
    current,
    reportFile:
      input.reportFile ??
      resolve(ALS_DELETION_REPORT_DIRECTORY, `${input.sourceVersion}.json`),
    approvalsFile: input.approvalsFile,
  })
  return current
}
