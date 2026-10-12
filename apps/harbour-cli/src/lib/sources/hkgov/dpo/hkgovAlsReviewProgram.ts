import {
  object,
  string,
  strings,
  version,
  coordinates,
} from './hkgovAlsReviewValidation'
import {
  parseAdditionalReviewOperation,
  validateReviewOperationFields,
  type AdditionalReviewOperation,
} from './hkgovAlsReviewOperationSchema'
import { strict as assert } from 'node:assert'
import program from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-review-program.json'
import { alsAuditFixtures } from './hkgovAlsAuditFixtures'
import { als3dHash } from './hkgovAls3d'
import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

type Guard = Record<string, unknown>
type SourceGuard = {
  sourceFile: string
  csu: string
  assertions: { version: string; hashes: string[] }[]
}
type IdentityDecision = {
  id: string
  sourceVersionFrom: string
  canonicalId: string
  aliasIds: string[]
  authority: string
  reason: string
  priorCuration?: unknown
  targetGuard: Guard
  targetGuardsBySourceVersion?: Record<string, Guard>
  previousGuards?: {
    id: string
    enFormattedAddress: string
    zhHantFormattedAddress: string
    coordinates: number[]
    coordinatesBySourceVersion?: Record<string, number[]>
  }[]
}
type OperationBase = { id: string; fixture: string; collection: string }
type ParentDecision = {
  id: string
  parentId: string
  childIds: string[]
  qualifiedEstate?: string
  childGranularity?: 'building' | 'section' | 'unit'
}
export type AlsReviewOperation =
  | AdditionalReviewOperation
  | (OperationBase &
      (
        | {
            code: 'guard-source-group'
            sourceVersionFrom: string
            decisions: SourceGuard[]
          }
        | {
            code: 'reconcile-identity'
            provenanceKey: string
            returnedAliases: 'reject' | 'coalesce-guarded'
            decisions: IdentityDecision[]
          }
        | {
            code: 'assign-parent'
            sourceVersionFrom: string
            authority: string
            phase: 'hierarchy' | 'initial-hierarchy'
            matchIdentityAliases: boolean
            decisions: ParentDecision[]
          }
      ))

/** Validate editor input before applying any operation. Unknown codes fail closed. */
export function parseAlsReviewProgram(
  input: unknown,
  documents: readonly { type: string; document: unknown }[],
): AlsReviewOperation[] {
  object(input)
  assert.equal(input.schemaVersion, 1, 'Unsupported ALS review program version')
  assert(Array.isArray(input.operations), 'Missing review operations')
  const ids = new Set<string>()
  return input.operations.map(raw => {
    object(raw)
    validateReviewOperationFields(raw)
    for (const key of ['id', 'fixture', 'collection']) string(raw[key])
    const base = raw as OperationBase
    assert(!ids.has(base.id), `Duplicate review operation: ${base.id}`)
    ids.add(base.id)
    const matches = documents.filter(d => d.type === base.fixture)
    assert.equal(matches.length, 1, `${base.id}: expected one registered fixture`)
    const document = matches[0]!.document
    object(document)
    const decisions = document[base.collection]
    assert(Array.isArray(decisions), `${base.id}: missing decision collection`)
    const additional = parseAdditionalReviewOperation(raw, decisions)
    if (additional) return additional
    if (raw.code === 'guard-source-group') {
      version(raw.sourceVersionFrom)
      for (const decision of decisions) {
        object(decision)
        string(decision.sourceFile)
        string(decision.csu)
        assert(
          Array.isArray(decision.assertions),
          `${base.id}: missing source assertions`,
        )
        const versions = new Set<string>()
        for (const assertion of decision.assertions) {
          object(assertion)
          version(assertion.version)
          strings(assertion.hashes)
          assert(
            !versions.has(assertion.version),
            `${base.id}: duplicate source assertion`,
          )
          versions.add(assertion.version)
          assert(
            assertion.hashes.every(hash => /^[a-f0-9]{64}$/.test(hash)),
            'Invalid source hash',
          )
        }
      }
      return {
        ...base,
        code: raw.code,
        sourceVersionFrom: raw.sourceVersionFrom,
        decisions: decisions as SourceGuard[],
      }
    }
    if (raw.code === 'assign-parent') {
      version(raw.sourceVersionFrom)
      string(raw.authority)
      assert(
        raw.phase === 'hierarchy' || raw.phase === 'initial-hierarchy',
        'Invalid parent assignment phase',
      )
      assert(
        typeof raw.matchIdentityAliases === 'boolean',
        'Missing identity alias selection policy',
      )
      const parentIds = new Set<string>()
      for (const decision of decisions) {
        object(decision)
        string(decision.id)
        string(decision.parentId)
        strings(decision.childIds)
        assert(!parentIds.has(decision.id), 'Duplicate parent decision')
        parentIds.add(decision.id)
        assert(
          !decision.childIds.includes(decision.parentId),
          'Parent cannot be its own child',
        )
        if (decision.qualifiedEstate !== undefined) string(decision.qualifiedEstate)
        if (decision.childGranularity !== undefined)
          assert(
            ['building', 'section', 'unit'].includes(String(decision.childGranularity)),
            'Invalid child granularity',
          )
      }
      return {
        ...base,
        code: raw.code,
        sourceVersionFrom: raw.sourceVersionFrom,
        authority: raw.authority,
        phase: raw.phase,
        matchIdentityAliases: raw.matchIdentityAliases,
        decisions: decisions as ParentDecision[],
      }
    }
    assert.equal(
      raw.code,
      'reconcile-identity',
      `${base.id}: unknown review operation code`,
    )
    string(raw.provenanceKey)
    assert(
      raw.returnedAliases === 'reject' || raw.returnedAliases === 'coalesce-guarded',
      'Invalid returned-alias policy',
    )
    const decisionIds = new Set<string>()
    for (const decision of decisions) {
      object(decision)
      for (const key of ['id', 'canonicalId', 'authority', 'reason'])
        string(decision[key])
      assert(
        !decisionIds.has(decision.id as string),
        `${base.id}: duplicate identity decision`,
      )
      decisionIds.add(decision.id as string)
      version(decision.sourceVersionFrom)
      strings(decision.aliasIds)
      assert(
        new Set(decision.aliasIds).size === decision.aliasIds.length &&
          !decision.aliasIds.includes(decision.canonicalId as string),
        'Invalid identity aliases',
      )
      object(decision.targetGuard)
      assert(Object.keys(decision.targetGuard).length, 'Missing target evidence')
      if (decision.targetGuardsBySourceVersion !== undefined) {
        object(decision.targetGuardsBySourceVersion)
        for (const [release, guard] of Object.entries(
          decision.targetGuardsBySourceVersion,
        )) {
          version(release)
          object(guard)
          assert(Object.keys(guard).length, 'Missing version-specific target evidence')
        }
      }
      if (raw.returnedAliases === 'coalesce-guarded') {
        assert(Array.isArray(decision.previousGuards), 'Missing returned-alias guards')
        for (const alias of decision.aliasIds) {
          const guards: Record<string, unknown>[] = decision.previousGuards.filter(
            g => g.id === alias,
          )
          assert.equal(guards.length, 1, `${alias}: expected one returned-alias guard`)
          const guard = guards[0]!
          string(guard.enFormattedAddress)
          string(guard.zhHantFormattedAddress)
          coordinates(guard.coordinates)
          if (guard.coordinatesBySourceVersion !== undefined) {
            object(guard.coordinatesBySourceVersion)
            for (const [release, point] of Object.entries(
              guard.coordinatesBySourceVersion,
            )) {
              version(release)
              coordinates(point)
            }
          }
        }
      }
    }
    return {
      ...base,
      code: 'reconcile-identity',
      provenanceKey: raw.provenanceKey,
      returnedAliases: raw.returnedAliases,
      decisions: decisions as IdentityDecision[],
    }
  })
}

export const alsReviewOperations = parseAlsReviewProgram(program, alsAuditFixtures)

export function applyReviewedAlsParents(
  rows: PreparedHkgovAlsRow[],
  sourceVersion: string,
  phase: 'hierarchy' | 'initial-hierarchy',
  fixture?: string,
) {
  for (const operation of alsReviewOperations) {
    if (
      operation.code !== 'assign-parent' ||
      operation.phase !== phase ||
      (fixture && operation.fixture !== fixture) ||
      sourceVersion < operation.sourceVersionFrom
    )
      continue
    for (const decision of operation.decisions) {
      const children: PreparedHkgovAlsRow[] = rows.filter(
        row =>
          decision.childIds.includes(row.id) ||
          (operation.matchIdentityAliases &&
            row.identityAlias &&
            decision.childIds.includes(row.identityAlias)) ||
          (decision.qualifiedEstate &&
            row.enEstateName === decision.qualifiedEstate &&
            row.enBlockNumber &&
            row.curatedGranularity !== 'complex'),
      )
      // Several publisher assertions can share this identity before consolidation.
      // The relationship targets the canonical ID, not a particular assertion.
      const parent = rows.find(row => row.id === decision.parentId)
      assert(parent || !children.length, `${decision.id}: inferred parent is missing`)
      for (const child of children) {
        assert.notEqual(
          child.id,
          parent!.id,
          `${decision.id}: distinct building required`,
        )
        child.parentAddressId = parent!.id
        child.curatedGranularity = decision.childGranularity ?? 'building'
        child.hierarchyCuration = JSON.stringify({
          id: decision.id,
          curationFile: `${operation.fixture}.json`,
          authority: operation.authority,
        })
      }
    }
  }
}

export function validateReviewedAlsSources(
  features: HkgovAlsSourceFeature[],
  sourceVersion: string,
  fixture?: string,
) {
  for (const operation of alsReviewOperations) {
    if (
      operation.code !== 'guard-source-group' ||
      (fixture && operation.fixture !== fixture) ||
      sourceVersion < operation.sourceVersionFrom
    )
      continue
    for (const guard of operation.decisions) {
      if (!features.some(f => f.sourceFile === guard.sourceFile)) continue
      const expected = guard.assertions.find(a => a.version === sourceVersion)
      assert(expected, `${guard.csu}: unreviewed source release (${operation.fixture})`)
      const hashes = features
        .filter(
          f =>
            f.sourceFile === guard.sourceFile &&
            f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
              ?.CsuId === guard.csu,
        )
        .map(f =>
          als3dHash([
            f.feature.properties?.Address?.PremisesAddress,
            f.feature.geometry,
          ]),
        )
        .sort()
      assert.deepEqual(
        hashes,
        expected.hashes,
        `${guard.csu}: source evidence changed (${operation.fixture})`,
      )
    }
  }
}

/** The fixture filter supports focused evidence review; production executes the whole program. */
export function applyReviewedAlsIdentityAliases(
  rows: PreparedHkgovAlsRow[],
  sourceVersion: string,
  fixture?: string,
) {
  const aliases = new Map<string, string>()
  for (const operation of alsReviewOperations) {
    if (
      operation.code !== 'reconcile-identity' ||
      (fixture && operation.fixture !== fixture)
    )
      continue
    for (const decision of operation.decisions) {
      if (sourceVersion < decision.sourceVersionFrom) continue
      const owners = rows.filter(r => r.id === decision.canonicalId)
      if (!owners.length) continue // District-only preparation cannot acquire another district's aliases.
      assert.equal(owners.length, 1, `${decision.id}: ambiguous curated owner`)
      const owner = owners[0]!
      for (const [key, expected] of Object.entries(
        decision.targetGuardsBySourceVersion?.[sourceVersion] ?? decision.targetGuard,
      )) {
        const actual = owner[key as keyof PreparedHkgovAlsRow]
        assert.deepEqual(
          key === 'geometry' ? JSON.parse(String(actual)) : actual,
          key === 'geometry' ? JSON.parse(String(expected)) : expected,
          `${decision.id}: target evidence changed (${key})`,
        )
      }
      const returnedEvidence = []
      const removed = new Set<PreparedHkgovAlsRow>()
      for (const id of decision.aliasIds) {
        const returned = rows.filter(r => r.id === id)
        if (operation.returnedAliases === 'reject')
          assert(
            !returned.length,
            `${decision.id}: alias is still independently present`,
          )
        const guard = decision.previousGuards?.find(g => g.id === id)
        for (const row of returned) {
          assert(guard, `${decision.id}: returned alias has no evidence guard`)
          assert.equal(
            row.enFormattedAddress,
            guard.enFormattedAddress,
            `${decision.id}: returned frontage changed`,
          )
          assert.equal(
            row.zhHantFormattedAddress,
            guard.zhHantFormattedAddress,
            `${decision.id}: returned frontage changed`,
          )
          assert.deepEqual(
            JSON.parse(row.geometry!).coordinates,
            guard.coordinatesBySourceVersion?.[sourceVersion] ?? guard.coordinates,
            `${decision.id}: returned location changed`,
          )
          returnedEvidence.push({
            id,
            sourceFile: row.sourceFile,
            sourceFeatureIndexOneBased: row.sourceFeatureIndexOneBased,
            publisherSource: row.publisherSource,
            sources: JSON.parse(row.sources),
          })
          removed.add(row)
        }
        assert(
          !aliases.has(id) || aliases.get(id) === owner.id,
          `${id}: conflicting reviewed alias owners`,
        )
        aliases.set(id, owner.id)
      }
      if (removed.size)
        rows.splice(0, rows.length, ...rows.filter(r => !removed.has(r)))
      owner.sources = JSON.stringify({
        ...JSON.parse(owner.sources),
        [operation.provenanceKey]: {
          id: decision.id,
          curationFile: `${operation.fixture}.json`,
          authority: decision.authority,
          ...(decision.priorCuration !== undefined
            ? { priorCuration: decision.priorCuration }
            : {}),
          aliasIds: decision.aliasIds,
          reason: decision.reason,
          ...(operation.returnedAliases === 'coalesce-guarded'
            ? { returnedPublisherAssertions: returnedEvidence }
            : {}),
        },
      })
    }
  }
  return aliases
}
