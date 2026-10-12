import { strict as assert } from 'node:assert'
import { object, string, strings, version } from './hkgovAlsReviewValidation'
import type { ReviewedPremiseRetention } from './hkgovAlsReviewRetentionSchema'

export type ReviewGuard = Record<string, unknown>
export type Classification = {
  id: string
  parentId: string
  targetGuard: ReviewGuard
  granularity?: 'building' | 'section' | 'unit'
  provenance: Record<string, unknown>
}
export type DuplicateSuppression = {
  id: string
  csu: string
  streetNumber: string
  buildingName: string
  retainRule: string
  authority: string
}
export type DerivedParent = {
  id: string
  sourceFile: string
  csu: string
  parentId: string
  derivedParent?: boolean
  parentRule?: string
  childGranularity: 'building' | 'section' | 'unit'
}
export type Coalescence = {
  id: string
  canonicalId: string
  csu: string
  enName: string
  previousUnitCount: number
  aliasIds: string[]
  unitAliasPairs: string[][]
  [key: string]: unknown
}
export type Inventory = {
  ownerId: string
  previousUnitCount: number
  unitIds: string[]
}
export type SectionOwnership = {
  id: string
  parentId: string
  childIds: string[]
  childGranularity?: string
}
export type BlockFrontages = {
  id: string
  selector: ReviewGuard
  blocks: {
    number: string
    preferredNumber: string
    aliasIds: string[]
    identityKey: string
  }[]
  fromNumber: string
  toNumber: string
  curationFile: string
  provenanceKey: string
  provenance: Record<string, unknown>
}
export type Frontage = {
  id: string
  fromNumber: string
  toNumber: string | null
  street: string
  zhStreet: string
  identityKey: string
}
export type ReconstructedFrontages = {
  id: string
  selector: ReviewGuard
  frontages: Frontage[]
  curationFile: string
  authority: string
  identityMatchMethod: string
  sourceRecordId: string
  derivedFromCurrentPremise: string
  frontageProvenanceKey: string
  subpremise: {
    id: string
    decisionId: string
    identityKey: string
    parentId: string
    role: string
    provenanceKey: string
  }
}
type Base = {
  id: string
  fixture: string
  collection: string
  sourceVersionFrom: string
}
export type AdditionalReviewOperation =
  | {
      id: string
      fixture: string
      collection: string
      code: 'retain-premise'
      decisions: ReviewedPremiseRetention[]
    }
  | (Base &
      (
        | {
            code: 'classify-premise'
            phase: 'shops' | 'final-parents'
            decisions: Classification[]
          }
        | { code: 'suppress-duplicate-premise'; decisions: DuplicateSuppression[] }
        | { code: 'derive-parent'; authority: string; decisions: DerivedParent[] }
        | { code: 'record-coalescence'; decisions: Coalescence[] }
        | { code: 'guard-inventory'; mode: 'coalesced'; decisions: Coalescence[] }
        | { code: 'guard-inventory'; mode: 'retained'; decisions: Inventory[] }
        | { code: 'preserve-section-ownership'; decisions: SectionOwnership[] }
        | { code: 'reconcile-block-frontages'; decisions: BlockFrontages[] }
        | { code: 'reconstruct-frontages'; decisions: ReconstructedFrontages[] }
      ))
const codes = new Set([
  'classify-premise',
  'suppress-duplicate-premise',
  'derive-parent',
  'record-coalescence',
  'guard-inventory',
  'preserve-section-ownership',
  'reconcile-block-frontages',
  'reconstruct-frontages',
])
function fields(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) string(value[key])
}
function guard(value: unknown) {
  object(value)
  assert(Object.keys(value).length, 'Missing reviewed selector or evidence')
}
function provenance(value: unknown) {
  object(value)
  fields(value, ['authority', 'curationFile'])
}
function count(value: unknown) {
  assert(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    'Invalid inventory count',
  )
}
function coalescence(d: Record<string, unknown>) {
  fields(d, ['id', 'canonicalId', 'csu', 'enName'])
  strings(d.aliasIds)
  count(d.previousUnitCount)
  assert(Array.isArray(d.unitAliasPairs), 'Missing canonical unit aliases')
  for (const pair of d.unitAliasPairs) {
    strings(pair)
    assert.equal(pair.length, 2, 'Invalid unit alias pair')
  }
  assert.equal(
    d.unitAliasPairs.length,
    d.previousUnitCount,
    'Unit alias count differs from reviewed inventory',
  )
}

/** Each semantic code validates its own data shape before any preparation stage runs. */
export function parseAdditionalReviewOperation(
  raw: Record<string, unknown>,
  decisions: unknown[],
): AdditionalReviewOperation | null {
  if (raw.code === 'retain-premise') {
    const ids = new Set<string>()
    for (const d of decisions) {
      object(d)
      fields(d, ['id', 'authority', 'sourceFile', 'canonicalId'])
      assert(!ids.has(d.id as string), 'Duplicate retained-premise decision')
      ids.add(d.id as string)
      strings(d.csus)
      assert(typeof d.retain === 'boolean', 'Missing retained-premise policy')
      if (d.sourceVersionFrom !== undefined) version(d.sourceVersionFrom)
      object(d.evidence)
      version(d.evidence.sourceVersion)
      object(d.evidence.feature)
      object(d.patch)
      assert(Array.isArray(d.assertions), 'Missing retained-premise evidence')
      for (const assertion of d.assertions) {
        object(assertion)
        version(assertion.version)
        strings(assertion.hashes)
        assert(
          assertion.hashes.every(hash => /^[a-f0-9]{64}$/.test(hash)),
          'Invalid retained-premise hash',
        )
      }
      if (d.application !== undefined) {
        object(d.application)
        version(d.application.sourceVersionFrom)
        version(d.application.lastVerifiedSourceVersion)
        assert.equal(
          d.application.mode,
          'until-revoked',
          'Unknown retained-premise application mode',
        )
        assert(
          d.application.state === 'active' || d.application.state === 'revoked',
          'Invalid retained-premise application state',
        )
      }
    }
    return { ...raw, decisions } as AdditionalReviewOperation
  }
  if (!codes.has(String(raw.code))) return null
  version(raw.sourceVersionFrom)
  if (raw.code === 'classify-premise')
    assert(
      raw.phase === 'shops' || raw.phase === 'final-parents',
      'Invalid classification phase',
    )
  if (raw.code === 'derive-parent') string(raw.authority)
  if (raw.code === 'guard-inventory')
    assert(
      raw.mode === 'coalesced' || raw.mode === 'retained',
      'Invalid inventory mode',
    )
  const ids = new Set<string>()
  for (const d of decisions) {
    object(d)
    const id = d.id ?? d.ownerId
    string(id)
    assert(!ids.has(id), `Duplicate review decision: ${id}`)
    ids.add(id)
    switch (raw.code) {
      case 'classify-premise':
        fields(d, ['id', 'parentId'])
        guard(d.targetGuard)
        provenance(d.provenance)
        assert(d.id !== d.parentId, 'Premise cannot parent itself')
        if (d.granularity !== undefined)
          assert(
            ['building', 'section', 'unit'].includes(String(d.granularity)),
            'Invalid premise granularity',
          )
        break
      case 'suppress-duplicate-premise':
        fields(d, [
          'id',
          'csu',
          'streetNumber',
          'buildingName',
          'retainRule',
          'authority',
        ])
        break
      case 'derive-parent':
        fields(d, ['id', 'sourceFile', 'csu', 'parentId'])
        assert(
          ['building', 'section', 'unit'].includes(String(d.childGranularity)),
          'Invalid derived child granularity',
        )
        if (d.derivedParent !== undefined)
          assert(typeof d.derivedParent === 'boolean', 'Invalid derived-parent flag')
        if (d.derivedParent) string(d.parentRule)
        break
      case 'record-coalescence':
        coalescence(d)
        break
      case 'guard-inventory':
        if (raw.mode === 'coalesced') coalescence(d)
        else {
          string(d.ownerId)
          strings(d.unitIds)
          count(d.previousUnitCount)
          assert.equal(
            d.unitIds.length,
            d.previousUnitCount,
            'Reviewed unit count differs from identities',
          )
        }
        break
      case 'preserve-section-ownership':
        fields(d, ['id', 'parentId'])
        strings(d.childIds)
        if (d.childGranularity !== undefined) string(d.childGranularity)
        break
      case 'reconcile-block-frontages': {
        fields(d, ['id', 'fromNumber', 'toNumber', 'curationFile', 'provenanceKey'])
        guard(d.selector)
        provenance(d.provenance)
        assert(
          Array.isArray(d.blocks) && d.blocks.length > 0,
          'Missing reviewed blocks',
        )
        const numbers = new Set<string>()
        for (const block of d.blocks) {
          object(block)
          fields(block, ['number', 'preferredNumber', 'identityKey'])
          strings(block.aliasIds)
          assert(!numbers.has(block.number as string), 'Duplicate reviewed block')
          numbers.add(block.number as string)
        }
        break
      }
      case 'reconstruct-frontages': {
        fields(d, [
          'id',
          'curationFile',
          'authority',
          'identityMatchMethod',
          'sourceRecordId',
          'derivedFromCurrentPremise',
          'frontageProvenanceKey',
        ])
        guard(d.selector)
        object(d.subpremise)
        fields(d.subpremise, [
          'id',
          'decisionId',
          'identityKey',
          'parentId',
          'role',
          'provenanceKey',
        ])
        assert(
          Array.isArray(d.frontages) && d.frontages.length > 0,
          'Missing reviewed frontages',
        )
        const frontageIds = new Set<string>()
        for (const f of d.frontages) {
          object(f)
          fields(f, ['id', 'fromNumber', 'street', 'zhStreet', 'identityKey'])
          if (f.toNumber !== null) string(f.toNumber)
          assert(
            !frontageIds.has(f.id as string) && f.id !== d.subpremise.id,
            'Duplicate reconstructed identity',
          )
          frontageIds.add(f.id as string)
        }
        assert(
          frontageIds.has(d.subpremise.parentId as string),
          'Subpremise parent must be a reconstructed frontage',
        )
        break
      }
    }
  }
  return { ...raw, decisions } as AdditionalReviewOperation
}

const baseFields = ['id', 'code', 'fixture', 'collection'] as const
export const reviewOperationFields: Record<string, readonly string[]> = {
  'guard-source-group': [...baseFields, 'sourceVersionFrom'],
  'reconcile-identity': [...baseFields, 'provenanceKey', 'returnedAliases'],
  'assign-parent': [
    ...baseFields,
    'sourceVersionFrom',
    'authority',
    'phase',
    'matchIdentityAliases',
  ],
  'classify-premise': [...baseFields, 'sourceVersionFrom', 'phase'],
  'suppress-duplicate-premise': [...baseFields, 'sourceVersionFrom'],
  'derive-parent': [...baseFields, 'sourceVersionFrom', 'authority'],
  'record-coalescence': [...baseFields, 'sourceVersionFrom'],
  'guard-inventory': [...baseFields, 'sourceVersionFrom', 'mode'],
  'preserve-section-ownership': [...baseFields, 'sourceVersionFrom'],
  'reconcile-block-frontages': [...baseFields, 'sourceVersionFrom'],
  'reconstruct-frontages': [...baseFields, 'sourceVersionFrom'],
  'retain-premise': [...baseFields],
}
export function validateReviewOperationFields(raw: Record<string, unknown>) {
  string(raw.code)
  const fields = reviewOperationFields[raw.code]
  assert(fields, `Unknown review operation code: ${raw.code}`)
  assert.deepEqual(
    Object.keys(raw).sort(),
    [...fields].sort(),
    `${raw.code}: missing or unsupported operation fields`,
  )
}
