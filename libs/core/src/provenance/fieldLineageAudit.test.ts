import { expect, test } from 'bun:test'
import { buildFieldLineageDefinition, computeVersionHash } from '@repo/db'
import { retainAuditResult } from './audit'
import { retainObject } from './objects'
import {
  readFieldLineageAuditContext,
  readFieldLineageDecisionEvidence,
} from './fieldLineageAudit'
import type { IndividualAudit } from './auditTypes'
import type { ObjectRef, ProvenanceStore } from './types'

function context(ref?: ObjectRef, release = 'source-release') {
  const response = { fields: [] }
  const result = buildFieldLineageDefinition([], new Map(), {
    api: {
      version: 'api-divisions-v0.1',
      responseSchemaVersion: 'test',
      responseSchemaHash: computeVersionHash(response),
    },
    apiReleaseSetId: 'api-release',
    apiVersionReleaseSetId: 'api-version-release',
    responseDefinition: response,
    sources: [
      {
        sourceDatasetId: 'dataset',
        sourceSchemaVersion: '1.0',
        resourceReleaseId: release,
        processingRules: null,
        processingManifest: ref,
      },
    ],
    snapshots: [],
  })
  return {
    ...result,
    scopeId: result.definition.scopes.find(scope => scope.kind === 'source-release')!
      .id,
  }
}
function memoryStore() {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  return { store, objects }
}

test('lineage binds exact audit counts and decision references without creating record traces', async () => {
  const { store, objects } = memoryStore()
  const codeRule = await retainObject(store, {
    id: 'conditional',
    basis: 'code',
    scope: 'bulk',
    summary: 'Conditional classification.',
  })
  const patchRule = await retainObject(store, {
    id: 'reviewed-patch',
    basis: 'fixture',
    scope: 'individual',
    summary: 'Reviewed patch.',
    review: { kind: 'patch' },
  })
  const fixture = await retainObject(store, {
    entries: [{ divisionId: 'division', replacement: { nameEn: 'Name' } }],
  })
  const action: IndividualAudit = {
    id: 'action',
    operation: 'reviewed-patch',
    basis: 'fixture',
    review: { kind: 'patch' },
    outcome: 'applied',
    summary: 'Reviewed patch.',
    reason: 'Reviewed name.',
    definition: patchRule,
    fixture: { object: fixture, pointer: '/entries/0' },
    record: { id: 'division', names: [], parents: [] },
    context: {},
  }
  const audit = await retainAuditResult(store, {
    scope: { stage: 'ingestion', ownerId: 'source-release' },
    resourceReleaseId: 'source-release',
    datasetCode: 'dataset',
    attempt: { id: 'attempt', status: 'completed' },
    bulk: [
      {
        id: 'conditional',
        definition: codeRule,
        basis: 'code',
        summary: 'Conditional classification.',
        outcome: 'applied',
        counts: { inputs: {}, outputs: {}, recordsAffected: 20, decisions: {} },
        fixtures: [],
      },
    ],
    guards: [],
    individuals: [action, action],
  })
  const bound = context(audit.ref)
  const before = objects.size
  const result = await readFieldLineageAuditContext(
    store,
    bound.definition,
    bound.binding,
    bound.scopeId,
  )
  expect(result.bulk[0]!.counts.recordsAffected).toBe(20)
  expect(result.decisions).toEqual([
    {
      definition: patchRule,
      fixture: { object: fixture, pointer: '/entries/0' },
      applicationCount: 2,
    },
  ])
  expect(result.interpretation).toBe('retained-evidence-not-field-winners')
  expect(objects.size).toBe(before)
  expect(bound.id).toBe(context().id)
  const wrong = context(audit.ref, 'another-release')
  await expect(
    readFieldLineageAuditContext(store, wrong.definition, wrong.binding, wrong.scopeId),
  ).rejects.toThrow('bound resource release')
  const missing = context()
  await expect(
    readFieldLineageAuditContext(
      store,
      missing.definition,
      missing.binding,
      missing.scopeId,
    ),
  ).rejects.toThrow('No retained processing manifest')
})

test('an effect manifest cannot be misread as a count-only audit', async () => {
  const { store } = memoryStore()
  const ref = await retainObject(store, {
    kind: 'processing-result',
    resourceReleaseId: 'source-release',
  })
  const bound = context(ref)
  await expect(
    readFieldLineageAuditContext(store, bound.definition, bound.binding, bound.scopeId),
  ).rejects.toThrow('effect manifests require their replay contract')
})

test('field decisions resolve original fixture entries through partition pointers and reject another instruction', async () => {
  const { store } = memoryStore()
  const patchFixture = (
    await import(
      '../../../../fixtures/meta/patches/overture-division-classification.json'
    )
  ).default
  const instruction = patchFixture.entries[0]!
  const declaration = await retainObject(store, {
    id: 'apply-division-classification-patch',
    basis: 'fixture',
    scope: 'bulk',
    summary: 'Reviewed patch.',
    review: { kind: 'patch' },
  })
  // The retained partition has a different document hash and ordinal from the authored document.
  const partition = await retainObject(store, {
    entries: [
      { divisionId: instruction.divisionId, replacement: { class: 'unrelated' } },
      instruction,
      { recordIds: [instruction.divisionId], text: 'Retained shared instruction' },
    ],
  })
  const action: IndividualAudit = {
    id: 'patch',
    operation: 'apply-division-classification-patch',
    basis: 'fixture',
    review: { kind: 'patch' },
    outcome: 'applied',
    summary: 'Reviewed patch.',
    reason: 'Reviewed classification.',
    definition: declaration,
    fixture: { object: partition, pointer: '/entries/1' },
    record: { id: instruction.divisionId, names: [], parents: [] },
    context: {},
  }
  const audit = await retainAuditResult(store, {
    scope: { stage: 'ingestion', ownerId: 'resource-release' },
    resourceReleaseId: 'resource-release',
    datasetCode: 'ds-hk-overture-division',
    attempt: { id: 'attempt', status: 'completed' },
    bulk: [
      {
        id: 'apply-division-classification-patch',
        definition: declaration,
        basis: 'fixture',
        summary: 'Retain reviewed instructions.',
        outcome: 'applied',
        counts: { inputs: {}, outputs: {}, recordsAffected: 2, decisions: {} },
        fixtures: [{ type: 'classification-instructions', object: partition }],
      },
    ],
    guards: [],
    individuals: [
      action,
      {
        ...action,
        id: 'another',
        fixture: { object: partition, pointer: '/entries/0' },
      },
      {
        ...action,
        id: 'shared',
        fixture: { object: partition, pointer: '/entries/2' },
      },
    ],
  })
  const response = { fields: ['attributes.level'] }
  const result = buildFieldLineageDefinition(
    [
      {
        resourceType: 'division',
        apiField: 'attributes.level',
        variant: null,
        sourceDatasetId: 'dataset',
        inputs: [{ origin: 'source', fieldPath: 'properties.adminLevel' }],
        canonicalInputs: ['division.level'],
        resolverCode: 'normalise-divisions',
        contributionType: 'primary',
        priority: 0,
        confidence: 1,
        resolverRules: [],
      },
    ],
    new Map([['dataset', { 'properties.adminLevel': 'admin_level' }]]),
    {
      api: {
        version: 'api-divisions-v0.2',
        responseSchemaVersion: 'test',
        responseSchemaHash: computeVersionHash(response),
      },
      apiReleaseSetId: 'release',
      apiVersionReleaseSetId: 'version',
      responseDefinition: response,
      sources: [
        {
          sourceDatasetId: 'dataset',
          datasetCode: 'ds-hk-overture-division',
          sourceSchemaVersion: '1.12.0',
          resourceReleaseId: 'resource-release',
          processingRules: null,
          processingManifest: audit.ref,
        },
      ],
      snapshots: [{ snapshotId: 'snapshot', resourceType: 'division' }],
    },
  )
  const patch = result.definition.nodes.find(node => node.layer === 'patch')!
  const matches = await readFieldLineageDecisionEvidence(
    store,
    result.definition,
    result.binding,
    patch.id,
    instruction.divisionId,
  )
  expect(matches).toHaveLength(1)
  expect(matches[0]!.fixture.pointer).toBe('/entries/1')
  expect(matches[0]!.instruction as unknown).toEqual(instruction)
  expect(matches[0]!.applicationCount).toBe(1)
  expect(matches[0]!.interpretation).toBe('retained-instruction-application-count')

  // Fixture selectors read the exact bound audit, including bulk evaluators
  // applying individual instructions. No automatic record trace is required.
  const selector = {
    instructionSelector: { fixtureTypes: ['classification-instructions'] },
  }
  const selectorHash = computeVersionHash(selector)
  result.definition.definitions[selectorHash] = selector
  if (patch.operation.kind !== 'resolver') throw new Error('Expected resolver')
  patch.operation.definition.definitionId = selectorHash
  result.binding.definitionId = computeVersionHash(result.definition)
  const selected = await readFieldLineageDecisionEvidence(
    store,
    result.definition,
    result.binding,
    patch.id,
    'canonical-alias',
    [instruction.divisionId],
  )
  expect(selected).toHaveLength(3)
  expect(selected.map(item => item.fixture.pointer).sort()).toEqual([
    '/entries/0',
    '/entries/1',
    '/entries/2',
  ])
  expect(
    await readFieldLineageDecisionEvidence(
      store,
      result.definition,
      result.binding,
      patch.id,
      'unrelated',
    ),
  ).toEqual([])
})
