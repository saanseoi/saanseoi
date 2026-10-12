import { alsReviewPolicy, alsReviewScope } from './hkgovAlsReviewPolicy'
import {
  readReviewEvidence,
  registerReviewEvidence,
} from '../../../storage/evidenceArchive.ts'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  alsMembershipHash,
  type AlsMembership,
  type AlsMembershipAddress,
} from './hkgovAlsMembership'
import type { AlsDeletionReport } from './hkgovAlsDeletionPreflight'

export const ALS_INVESTIGATIONS_DIRECTORY = resolve(
  import.meta.dir,
  '../../../../../../../fixtures/reviews/hkgov-dpo-address-investigations',
)

/** Deferral is an exact-evidence acknowledgement, never a retirement approval. */
export async function deferAlsDeletionReview(input: {
  report: AlsDeletionReport
  previous: AlsMembership | null
  current: AlsMembership
  authority?: string
  directory?: string
}) {
  const { report, previous, current } = input
  if (!report.requiresReview || !previous) return null
  const file = resolve(
    input.directory ?? ALS_INVESTIGATIONS_DIRECTORY,
    `${report.sourceVersion}-${report.digest}.json`,
  )
  const existing = await (input.directory
    ? readFile(file, 'utf8')
    : readReviewEvidence(file)
  )
    .then(value => (value === null ? null : JSON.parse(value)))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  const matches = (value: any) =>
    value?.schemaVersion === 1 &&
    value.status === 'needs-further-investigation' &&
    value.ingestionEffect === 'allow-publisher-omission' &&
    value.sourceVersion === report.sourceVersion &&
    value.previousSourceVersion === report.previousSourceVersion &&
    value.deletionReportDigest === report.digest &&
    typeof value.authority === 'string' &&
    value.authority.trim() &&
    alsMembershipHash(value.suspicious) === alsMembershipHash(report.suspicious) &&
    value.evidenceHash ===
      alsMembershipHash({ cases: value.cases, inventories: value.inventories })
  if (existing) {
    if (!matches(existing)) return null
    if (!input.directory) await registerReviewEvidence(file)
    return file
  }
  if (
    !input.authority?.trim() ||
    !alsReviewScope('defer-investigation', report.sourceVersion)
  )
    return null
  const old = new Map(previous.addresses.map(a => [a.id, a]))
  const bySource = new Map<string, AlsMembershipAddress[]>()
  const byCoordinate = new Map<string, AlsMembershipAddress[]>()
  for (const address of current.addresses) {
    for (const id of address.sourceIds)
      bySource.set(id, [...(bySource.get(id) ?? []), address])
    if (address.coordinates) {
      const key = JSON.stringify(address.coordinates)
      byCoordinate.set(key, [...(byCoordinate.get(key) ?? []), address])
    }
  }
  const ids = new Set(
    report.suspicious.flatMap(group =>
      group.reason === 'whole_inventory_loss'
        ? []
        : (group.ids ??
          (group.level
            ? (report.groups[group.level]?.retirements.map(r => r.id) ?? [])
            : [])),
    ),
  )
  for (const collection of previous.collections) {
    const owner = old.get(collection.ownerId)
    for (const [id, floor, unit, en, zhHant] of collection.units) {
      if (!ids.has(id)) continue
      old.set(id, {
        id,
        level: 'unit',
        parentId: collection.ownerId,
        en,
        zhHant,
        coordinates: owner?.coordinates ?? null,
        sourceIds: collection.sourceIds,
        curations: collection.curations ?? [],
      })
    }
  }
  const cases = [...ids].sort().map(id => {
    const address = old.get(id)
    if (!address) throw new Error(`Missing investigation predecessor ${id}`)
    const candidates = new Map<
      string,
      { address: AlsMembershipAddress; evidence: string[] }
    >()
    const add = (candidate: AlsMembershipAddress, evidence: string) => {
      const item = candidates.get(candidate.id) ?? { address: candidate, evidence: [] }
      if (!item.evidence.includes(evidence)) item.evidence.push(evidence)
      candidates.set(candidate.id, item)
    }
    for (const source of address.sourceIds)
      for (const candidate of bySource.get(source) ?? [])
        add(candidate, 'same publisher source ID')
    for (const candidate of byCoordinate.get(JSON.stringify(address.coordinates)) ?? [])
      add(candidate, 'same coordinates; identity not established')
    return {
      id,
      status: 'needs-further-investigation',
      previous: address,
      candidates: [...candidates.values()],
      reason:
        'Insufficient evidence to confirm retirement, continuation, or premise scope. Publisher omission is permitted pending review.',
    }
  })
  const lost = new Set(report.wholeInventoryLosses.map(loss => loss.collectionId))
  const inventories = previous.collections
    .filter(collection => lost.has(collection.id))
    .map(collection => ({
      status: 'needs-further-investigation',
      previous: collection,
      owner: old.get(collection.ownerId),
    }))
  const record = {
    schemaVersion: 1,
    status: 'needs-further-investigation',
    ingestionEffect: 'allow-publisher-omission',
    sourceVersion: report.sourceVersion,
    previousSourceVersion: report.previousSourceVersion,
    deletionReportDigest: report.digest,
    previousMembershipSha256: report.previousMembershipSha256,
    membershipSha256: report.membershipSha256,
    authority: input.authority,
    recordedAt: new Date().toISOString(),
    suspicious: report.suspicious,
    cases,
    inventories,
    evidenceHash: alsMembershipHash({ cases, inventories }),
  }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
  if (!input.directory) await registerReviewEvidence(file)
  return file
}

export function isDeferrableAlsIssue(issue: unknown) {
  const code = (issue as { code?: unknown })?.code
  return (
    typeof code === 'string' &&
    alsReviewPolicy.scopes.some(
      scope => scope.code === 'defer-investigation' && scope.issueCodes.includes(code),
    )
  )
}

/** Semantic uncertainty may be queued; malformed or inconsistent data may not. */
export async function deferAlsPreparationReview(input: {
  sourceVersion: string
  reviewSha256: string
  issues: unknown[]
  authority?: string
  directory?: string
}) {
  if (!input.issues.length || !input.issues.every(isDeferrableAlsIssue)) return false
  const path = resolve(
    input.directory ?? ALS_INVESTIGATIONS_DIRECTORY,
    `preparation-${input.sourceVersion}-${input.reviewSha256}.json`,
  )
  const existing = await (input.directory
    ? readFile(path, 'utf8')
    : readReviewEvidence(path)
  )
    .then(value => (value === null ? null : JSON.parse(value)))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  const evidenceHash = alsMembershipHash(input.issues)
  if (existing) {
    const matches =
      existing.status === 'needs-further-investigation' &&
      existing.sourceVersion === input.sourceVersion &&
      existing.reviewSha256 === input.reviewSha256 &&
      existing.evidenceHash === evidenceHash &&
      alsMembershipHash(existing.issues) === evidenceHash &&
      typeof existing.authority === 'string' &&
      Boolean(existing.authority.trim())
    if (matches && !input.directory) await registerReviewEvidence(path)
    return matches
  }
  if (
    !input.authority?.trim() ||
    !alsReviewScope('defer-investigation', input.sourceVersion)
  )
    return false
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    JSON.stringify(
      {
        schemaVersion: 1,
        status: 'needs-further-investigation',
        sourceVersion: input.sourceVersion,
        reviewSha256: input.reviewSha256,
        authority: input.authority,
        recordedAt: new Date().toISOString(),
        issues: input.issues,
        evidenceHash,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  )
  if (!input.directory) await registerReviewEvidence(path)
  return true
}
