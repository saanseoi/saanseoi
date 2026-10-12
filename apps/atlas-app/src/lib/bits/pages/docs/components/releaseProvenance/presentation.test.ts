import { expect, test } from 'bun:test'
import type { LineageDefinition, Node } from '@repo/db/fieldLineageTypes'
import {
  traceNodes,
  reverseFieldFlow,
  conditionLabel,
  fieldFlow,
  provenanceScopeLabels,
} from './presentation'

test('trace includes all candidate branches and shared inputs once, before their consumers', () => {
  const nodes = [
    { id: 'raw', stage: 'ingestion', inputs: {} },
    { id: 'a', stage: 'assembly', inputs: { value: { node: 'raw' } } },
    { id: 'b', stage: 'assembly', inputs: { value: { node: 'raw' } } },
    { id: 'response', stage: 'composition', inputs: { value: { group: 'choice' } } },
    { id: 'unrelated', stage: 'preparation', inputs: {} },
  ] as Node[]
  const definition = {
    nodes,
    resolutionGroups: [{ id: 'choice', candidates: ['a', 'b'] }],
  } as LineageDefinition
  expect(traceNodes(definition, 'response').map(node => node.id)).toEqual([
    'raw',
    'a',
    'b',
    'response',
  ])
})
test('parallel branches follow processing stages and keep same-stage dependencies first', () => {
  const definition = {
    nodes: [
      { id: 'publisher', stage: 'ingestion', inputs: {} },
      { id: 'prepared-a', stage: 'preparation', inputs: {} },
      {
        id: 'assembly-a',
        stage: 'assembly',
        inputs: {
          evidence: { node: 'publisher' },
          record: { node: 'prepared-a' },
        },
      },
      { id: 'prepared-b', stage: 'preparation', inputs: {} },
      { id: 'curated', stage: 'ingestion', inputs: { record: { node: 'prepared-b' } } },
      {
        id: 'assembly-b',
        stage: 'assembly',
        inputs: { evidence: { node: 'curated' } },
      },
      { id: 'response', stage: 'composition', inputs: { value: { node: 'composed' } } },
      { id: 'composed', stage: 'composition', inputs: { value: { group: 'choice' } } },
    ],
    resolutionGroups: [{ id: 'choice', candidates: ['assembly-a', 'assembly-b'] }],
  } as LineageDefinition
  const ordered = traceNodes(definition, 'response')
  expect(ordered.map(node => node.id)).toEqual([
    'prepared-a',
    'prepared-b',
    'publisher',
    'curated',
    'assembly-a',
    'assembly-b',
    'composed',
    'response',
  ])
  // The UI derives both card numbers and input references from this ordering.
  const steps = new Map(ordered.map((node, index) => [node.id, index + 1]))
  expect(definition.resolutionGroups[0]?.candidates.map(id => steps.get(id))).toEqual([
    5, 6,
  ])
})
test('conditions display readable alternatives rather than object serialisation', () => {
  expect(
    conditionLabel({
      kind: 'any',
      conditions: [
        { kind: 'compare', input: 'profile', operator: 'in', value: ['map', 'full'] },
        { kind: 'unresolved', reason: 'upstream not retained' },
      ],
    }),
  ).toBe('profile is one of map, full or Unresolved: upstream not retained')
})

test('evidence is separate but shared value dependencies remain in the main flow', () => {
  const definition = {
    nodes: [
      { id: 'record', stage: 'preparation', inputs: {} },
      {
        id: 'retained',
        stage: 'ingestion',
        inputs: { record: { node: 'record', role: 'value' } },
      },
      {
        id: 'assembly',
        stage: 'assembly',
        inputs: {
          record: { node: 'record', role: 'value' },
          proof: { node: 'retained', role: 'evidence' },
        },
      },
      {
        id: 'response',
        stage: 'composition',
        inputs: { value: { group: 'choice', role: 'value' } },
      },
    ],
    resolutionGroups: [{ id: 'choice', candidates: ['assembly'] }],
  } as LineageDefinition
  const result = fieldFlow(definition, 'response')
  expect(result.flow.map(node => node.id)).toEqual(['record', 'assembly', 'response'])
  expect(result.evidence.map(node => node.id)).toEqual(['retained'])
  expect(result.references.get('retained')).toBe('Evidence 1')
  expect(result.references.get('assembly')).toBe('Step 2')
})

test('scope labels distinguish resources and propagate exact pinned source identity', () => {
  const definition = {
    scopes: [
      {
        id: 'division',
        kind: 'source-release',
        sourceDatasetId: 'dataset',
        resourceType: 'division',
      },
      {
        id: 'area',
        kind: 'source-release',
        sourceDatasetId: 'dataset',
        resourceType: 'divisionArea',
      },
      { id: 'prepared', kind: 'prepared-artefact' },
    ],
  } as LineageDefinition
  const binding = {
    scopes: [
      { scopeId: 'division', resourceReleaseId: 'release-division' },
      { scopeId: 'area', resourceReleaseId: 'release-area' },
      { scopeId: 'prepared', resourceReleaseId: 'release-area' },
    ],
  } as import('@repo/db/fieldLineageTypes').ReleaseBinding
  const labels = provenanceScopeLabels(definition, binding, {
    dataset: 'Reviewed geography',
  })
  expect(labels.division).toBe('Reviewed geography · division')
  expect(labels.area).toBe('Reviewed geography · division Area')
  expect(labels.prepared).toBe(labels.area)
})

test('reverse flow starts at the response and branches only on value producers', async () => {
  const { reverseFieldFlow } = await import('./presentation')
  const definition = {
    nodes: [
      { id: 'raw', stage: 'preparation', inputs: {} },
      { id: 'guard', stage: 'preparation', inputs: {} },
      {
        id: 'a',
        stage: 'assembly',
        layer: 'baseline',
        priority: 0,
        inputs: {
          value: { node: 'raw', role: 'value' },
          guard: { node: 'guard', role: 'guard' },
        },
      },
      {
        id: 'b',
        stage: 'assembly',
        layer: 'patch',
        priority: 0,
        inputs: { value: { node: 'raw', role: 'value' } },
      },
      {
        id: 'response',
        stage: 'composition',
        inputs: { value: { group: 'choice', role: 'value' } },
      },
    ],
    resolution: { layerOrder: ['baseline', 'conditional-rule', 'curation', 'patch'] },
    resolutionGroups: [{ id: 'choice', candidates: ['a', 'b'] }],
  } as unknown as LineageDefinition
  const trace = reverseFieldFlow(definition, 'response')
  expect(trace.root.kind).toBe('node')
  if (trace.root.kind !== 'node') throw Error('Expected response')
  expect(trace.root.node.id).toBe('response')
  const choice = trace.root.children[0]!
  expect(choice.kind).toBe('choice')
  if (choice.kind !== 'choice') throw Error('Expected choice')
  expect(choice.children.map(child => child.kind === 'node' && child.node.id)).toEqual([
    'b',
    'a',
  ])
  const second = choice.children[1]!
  if (second.kind !== 'node') throw Error('Expected candidate')
  expect(second.children).toEqual([{ kind: 'reference', id: 'raw', reference: '3a' }])
  expect(trace.evidence.map(node => node.id)).toEqual(['guard'])
})

test('reverse flow terminates shared cycles and reports missing dependencies', async () => {
  const { reverseFieldFlow } = await import('./presentation')
  const definition = {
    nodes: [
      {
        id: 'a',
        stage: 'assembly',
        inputs: {
          self: { node: 'a', role: 'value' },
          missing: { node: 'missing', role: 'value' },
        },
      },
    ],
    resolutionGroups: [],
  } as unknown as LineageDefinition
  const result = reverseFieldFlow(definition, 'a')
  if (result.root.kind !== 'node') throw Error('Expected node')
  expect(result.root.children.map(child => child.kind)).toEqual([
    'reference',
    'missing',
  ])
})

test('field flow bypasses unrelated corrections and retains coordinate changes', async () => {
  const { reverseFieldFlow } = await import('./presentation')
  const resolver = (id: string) => ({
    kind: 'resolver',
    definition: { definitionId: id },
  })
  const definition = {
    fields: [{ terminalNode: 'response', apiField: 'attributes.geometry' }],
    definitions: {
      names: {
        human: { fieldScope: { fields: ['i18n.*'], otherwiseInput: 'record' } },
      },
      coordinates: {
        human: { fieldScope: { fields: ['geometry'], otherwiseInput: 'record' } },
      },
    },
    nodes: [
      { id: 'source', inputs: {} },
      {
        id: 'coordinates',
        operation: resolver('coordinates'),
        inputs: { record: { node: 'source', role: 'value' } },
      },
      {
        id: 'names',
        operation: resolver('names'),
        inputs: { record: { node: 'coordinates', role: 'value' } },
      },
      { id: 'response', inputs: { value: { node: 'names', role: 'value' } } },
    ],
    resolutionGroups: [],
  } as unknown as LineageDefinition
  const ids = (branch: ReturnType<typeof reverseFieldFlow>['root']): string[] =>
    branch.kind === 'node' ? [branch.node.id, ...branch.children.flatMap(ids)] : []
  expect(ids(reverseFieldFlow(definition, 'response').root)).toEqual([
    'response',
    'coordinates',
    'source',
  ])
  definition.fields[0]!.apiField = 'attributes.i18n.en.name'
  expect(ids(reverseFieldFlow(definition, 'response').root)).toEqual([
    'response',
    'names',
    'source',
  ])
})

test('field-specific producer view excludes geography lookups from coordinates', async () => {
  const { reverseFieldFlow } = await import('./presentation')
  const definition = {
    fields: [{ terminalNode: 'projection', apiField: 'attributes.geometry' }],
    nodes: [
      {
        id: 'projection',
        stage: 'preparation',
        operation: { kind: 'resolver', definition: { definitionId: 'rule' } },
        inputs: {
          coordinates: {
            stage: 'raw',
            scope: 'publisher',
            collection: 'features',
            path: 'geometry',
            role: 'value',
          },
          geography: { node: 'names', role: 'value' },
        },
      },
      { id: 'names', inputs: {} },
    ],
    definitions: {
      rule: {
        human: {
          kind: 'normalise',
          title: 'Publisher record',
          description: 'Prepare the record.',
          fieldViews: [
            {
              fields: ['geometry'],
              title: 'Publisher coordinates',
              description: 'Use the publisher point.',
              inputs: ['coordinates'],
            },
          ],
        },
      },
    },
    resolutionGroups: [],
  } as unknown as LineageDefinition
  const result = reverseFieldFlow(definition, 'projection').root
  if (result.kind !== 'node') throw Error('Expected node')
  expect(result.human?.title).toBe('Publisher coordinates')
  expect(Object.keys(result.node.inputs)).toEqual(['coordinates'])
  expect(result.children.map(child => child.kind)).toEqual(['source'])
  expect(Object.keys(definition.nodes[0]!.inputs)).toEqual(['coordinates', 'geography'])
})

test('cross-field inputs become navigable references in the same resource and variant', () => {
  const fields = [
    {
      resourceType: 'divisionArea',
      apiField: 'attributes.bbox',
      variant: 'simplified',
      terminalNode: 'bbox',
    },
    {
      resourceType: 'divisionArea',
      apiField: 'attributes.geometry',
      variant: 'simplified',
      terminalNode: 'geometry',
    },
    {
      resourceType: 'divisionArea',
      apiField: 'attributes.geometry',
      terminalNode: 'exact',
    },
  ]
  const definition = {
    fields,
    scopes: [{ id: 'prepared', resourceType: 'divisionArea' }],
    definitions: {},
    resolutionGroups: [],
    nodes: [
      {
        id: 'bbox',
        stage: 'assembly',
        output: { scope: 'prepared', path: 'bbox' },
        inputs: { geometry: { node: 'prepared-shape', role: 'value' } },
      },
      {
        id: 'prepared-shape',
        stage: 'preparation',
        output: { scope: 'prepared', path: 'geometry' },
        inputs: {
          value: {
            scope: 'raw',
            stage: 'raw',
            collection: 'rows',
            path: 'geometry',
            role: 'value',
          },
        },
      },
    ],
  } as unknown as LineageDefinition
  const trace = reverseFieldFlow(definition, 'bbox')
  expect(trace.root.kind).toBe('node')
  if (trace.root.kind !== 'node') throw Error('Expected bbox node')
  expect(trace.root.children).toEqual([
    {
      kind: 'field',
      field: definition.fields[1],
      source: {
        scope: 'raw',
        stage: 'raw',
        collection: 'rows',
        path: 'geometry',
        role: 'value',
      },
    },
  ])
  // Prepared resource metadata is optional in retained definitions. The owner
  // still establishes the same resource without expanding geometry inline.
  definition.scopes = [
    {
      id: 'publisher',
      kind: 'source-release',
      resourceType: 'divisionArea',
      bindingRole: 'publisher',
    },
    {
      id: 'publisher-prepared',
      kind: 'prepared-artefact',
      bindingRole: 'publisher-prepared',
    },
  ]
  for (const node of definition.nodes) node.output.scope = 'publisher-prepared'
  const withoutResourceMetadata = reverseFieldFlow(definition, 'bbox')
  if (withoutResourceMetadata.root.kind !== 'node') throw Error('Expected bbox node')
  expect(withoutResourceMetadata.root.children[0]?.kind).toBe('field')
  // No corresponding simplified field means keep the real producer inline.
  definition.fields = [fields[0], fields[2]] as LineageDefinition['fields']
  const unmatched = reverseFieldFlow(definition, 'bbox')
  if (unmatched.root.kind !== 'node') throw Error('Expected bbox node')
  expect(unmatched.root.children[0]?.kind).toBe('node')
})
