import { expect, test } from 'bun:test'
import {
  buildFieldLineageDefinition,
  expandFieldLineage,
  selectFieldLineageCandidate,
  validateFieldLineageDefinition,
} from './fieldLineage'
import { computeVersionHash } from './versioning'
import type {
  FieldLineageMapping,
  LineagePublicationContext,
} from './fieldLineageCompiler'

const responseDefinition = { version: 'api-v1', fields: ['attributes.name'] }
const context: LineagePublicationContext = {
  api: {
    version: 'api-v1',
    responseSchemaVersion: 'schema-v1',
    responseSchemaHash: computeVersionHash(responseDefinition),
  },
  apiReleaseSetId: 'release-one',
  apiVersionReleaseSetId: 'version-release-one',
  responseDefinition,
  sources: [
    {
      sourceDatasetId: 'dataset',
      sourceSchemaVersion: '1.0',
      resourceReleaseId: 'source-one',
      processingRules: null,
    },
  ],
  snapshots: [{ resourceType: 'division', snapshotId: 'snapshot-one' }],
}
const field: FieldLineageMapping = {
  resourceType: 'division',
  apiField: 'attributes.name',
  variant: null,
  sourceDatasetId: 'dataset',
  inputs: [{ origin: 'source', fieldPath: 'properties.name' }],
  canonicalInputs: ['division.name'],
  resolverCode: 'direct_copy',
  contributionType: 'primary',
  priority: 9,
  confidence: 0.2,
  resolverRules: [],
}
const publisher = new Map([['dataset', { 'properties.name': 'name' }]])
const build = (c = context, fields = [field]) =>
  buildFieldLineageDefinition(fields, publisher, c)

test('reusable graph identity excludes concrete release and snapshot bindings', () => {
  const a = build()
  const changed = structuredClone(context)
  changed.apiReleaseSetId = 'release-two'
  changed.apiVersionReleaseSetId = 'version-release-two'
  changed.sources[0]!.resourceReleaseId = 'source-two'
  changed.snapshots[0]!.snapshotId = 'snapshot-two'
  const b = build(changed)
  expect(a.id).toBe(b.id)
  expect(a.binding).not.toEqual(b.binding)
  expect(JSON.stringify(a.definition)).not.toContain('source-one')
  expect(a.definition.fields[0]!.provenance.ingestion).toHaveLength(1)
  expect(
    expandFieldLineage(a.definition, a.definition.fields[0]!).provenance.assembly,
  ).toHaveLength(1)
})

test('untraced upstream processing is explicit and never described as a copy', () => {
  const result = build()
  expect(result.definition.fields[0]!.completeness).toBe('unknown-upstream')
  expect(
    result.definition.nodes.find(node => node.stage === 'ingestion')!.operation.kind,
  ).toBe('unresolved')
  expect(result.definition.fields[0]!.provenance.preparation).toEqual([])
})

test('different schema versions of one dataset get separate immutable scopes', () => {
  const changed = structuredClone(context)
  changed.sources.push({
    ...changed.sources[0]!,
    sourceSchemaVersion: '2.0',
    resourceReleaseId: 'source-two',
  })
  const result = build(changed)
  expect(result.definition.sourceSchemas).toHaveLength(2)
  expect(new Set(result.definition.sourceSchemas.map(pin => pin.scopeId)).size).toBe(2)
  expect(result.definition.fields[0]!.provenance.assembly).toHaveLength(2)
  expect(result.id).not.toBe(build().id)
})

test('release graphs select the mapped resource within a shared source dataset', () => {
  const changed = structuredClone(context)
  changed.sources[0]!.resourceType = 'division'
  changed.sources.push({
    ...changed.sources[0]!,
    resourceType: 'divisionArea',
    resourceReleaseId: 'area-source',
  })
  const result = build(changed)
  const plan = result.definition.fields[0]!
  expect(plan.provenance.ingestion).toHaveLength(1)
  expect(plan.provenance.assembly).toHaveLength(1)
  const ingestion = result.definition.nodes.find(
    node => node.id === plan.provenance.ingestion[0],
  )!
  expect(
    result.definition.scopes.find(scope => scope.id === ingestion.output.scope)
      ?.resourceType,
  ).toBe('division')
})

test('dependency rankings are grouped rather than treated as override priorities', () => {
  const result = build(context, [field, { ...field, priority: 0, confidence: 1 }])
  expect(result.definition.fields).toHaveLength(1)
  expect(result.definition.resolutionGroups[0]!.candidates).toHaveLength(1)
  expect(
    result.definition.nodes.find(node => node.stage === 'assembly')!.priority,
  ).toBe(0)
})

test('patch wins across fields and an applicable tie in the winning layer fails', () => {
  const base = build().definition.nodes.find(node => node.stage === 'assembly')!
  const curation = { ...base, id: 'curation', layer: 'curation' as const, priority: 0 }
  const patch = {
    ...base,
    id: 'patch',
    layer: 'patch' as const,
    priority: 100,
    operation: { kind: 'constant' as const, value: null },
  }
  expect(selectFieldLineageCandidate([base, patch, curation], () => true)).toEqual(
    patch,
  )
  expect(
    selectFieldLineageCandidate([base, patch, curation], node => node.id !== 'patch'),
  ).toEqual(curation)
  expect(() =>
    selectFieldLineageCandidate([patch, { ...patch, id: 'other' }], () => true),
  ).toThrow('Conflicting')
})

test('validation rejects cycles, forged documents and per-record automatic audits', () => {
  const result = build().definition
  const cycle = structuredClone(result)
  cycle.nodes[0]!.inputs.self = { node: cycle.nodes[0]!.id, role: 'value' }
  expect(() => validateFieldLineageDefinition(cycle)).toThrow('Cyclic')
  const corrupt = structuredClone(result)
  corrupt.definitions[context.api.responseSchemaHash] = { forged: true }
  expect(() => validateFieldLineageDefinition(corrupt)).toThrow('hash mismatch')
  const individual = structuredClone(result)
  individual.nodes[0]!.audit.scope = 'individual'
  expect(() => validateFieldLineageDefinition(individual)).toThrow('Individual audit')
})

test('release bindings reject empty snapshot selections and unretained definitions', async () => {
  const { validateFieldLineageBinding } = await import('./fieldLineageGraph')
  const result = build()
  const empty = structuredClone(result.binding)
  const snapshot = empty.scopes.find(scope => scope.snapshotId)!
  delete snapshot.snapshotId
  snapshot.snapshotIds = []
  expect(() => validateFieldLineageBinding(result.definition, empty)).toThrow(
    'Invalid snapshot binding',
  )
  const missing = structuredClone(result.binding)
  missing.scopes[0]!.definitionHashes = ['absent']
  expect(() => validateFieldLineageBinding(result.definition, missing)).toThrow(
    'Missing bound definition',
  )
})

test('field emission and selection conditions are validated, not just operation edges', () => {
  const result = build().definition
  const invalid = structuredClone(result)
  invalid.fields[0]!.emitWhen = {
    kind: 'compare',
    input: 'missingProfile',
    operator: 'eq',
    value: 'full',
  }
  expect(() => validateFieldLineageDefinition(invalid)).toThrow(
    'Unknown condition input',
  )
  const sourcePin = structuredClone(result)
  sourcePin.sourceSchemas = []
  expect(() => validateFieldLineageDefinition(sourcePin)).toThrow(
    'Missing source schema pin',
  )
})
