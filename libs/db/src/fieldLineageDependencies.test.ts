import { expect, test } from 'bun:test'
import { compileFieldLineage, type LineageSource } from './fieldLineageCompiler'
import { currentPlaceFieldRule } from './fieldLineageCurrentRules'
import { computeVersionHash } from './versioning'

function compile(
  resourceType: 'place' | 'division',
  apiField: string,
  sources?: LineageSource[],
  inputs: import('./apiFieldInputs').ApiFieldInput[] = [],
) {
  const response = {}
  return compileFieldLineage(
    [
      {
        resourceType,
        apiField,
        variant: null,
        sourceDatasetId: 'dataset',
        inputs,
        canonicalInputs: [`${resourceType}.${apiField.replace(/^attributes\./, '')}`],
        resolverCode: 'normalise',
        contributionType: 'primary',
        priority: 0,
        confidence: 1,
        resolverRules: [],
      },
    ],
    new Map(),
    {
      api: {
        version: resourceType === 'place' ? 'api-places-v0.1' : 'api-divisions-v0.1',
        responseSchemaVersion: 'test',
        responseSchemaHash: computeVersionHash(response),
      },
      apiReleaseSetId: 'release',
      apiVersionReleaseSetId: 'version-release',
      responseDefinition: response,
      sources: sources ?? [
        {
          sourceDatasetId: 'dataset',
          datasetCode: `ds-hk-overture-${resourceType}`,
          sourceSchemaVersion: '2026-09-23.0',
          resourceReleaseId: 'source-release',
          processingRules: null,
        },
      ],
      snapshots: [{ resourceType, snapshotId: 'snapshot' }],
    },
  ).definition
}

test('hierarchy classifications use auditable baseline, curation and patch candidates', () => {
  const definition = compile('division', 'attributes.hierarchies')
  for (const path of ['effectiveClass', 'effectiveLevel']) {
    const group = definition.resolutionGroups.find(
      group => group.output.path === path && group.id.endsWith('-baseline-value'),
    )!
    expect(group).toBeDefined()
    const candidates = group.candidates.map(
      id => definition.nodes.find(node => node.id === id)!,
    )
    expect(candidates.map(node => node.layer)).toEqual([
      'baseline',
      'curation',
      'patch',
    ])
    expect(candidates[1]!.audit.retention).toBe('decision')
    expect(candidates[2]!.audit.retention).toBe('decision')
    expect(candidates[2]!.audit.binding?.recordKeyInputs).toContain('recordId')
  }
  expect(definition.fields[0]!.completeness).toBe('complete')
  expect(
    definition.nodes.find(node => node.output.path === 'effectiveI18n')?.layer,
  ).toBe('patch')
  expect(
    definition.nodes.find(node => node.output.path === 'hierarchyLookup')?.audit
      .category,
  ).toBe('translations')
})

test('Place point consumes the resolution and cannot claim raw-only closure', () => {
  const definition = compile('place', 'attributes.geometry')
  expect(currentPlaceFieldRule('attributes.geometry')!.inputs).toEqual([
    'effectiveCoordinates',
  ])
  const coordinateNode = definition.nodes.find(
    node => node.output.path === 'effectiveCoordinates',
  )!
  expect(coordinateNode.inputs.resolution).toHaveProperty('group')
  expect(coordinateNode.inputs.place).toHaveProperty('node')
  expect(definition.fields[0]!.completeness).toBe('complete')
  const candidates = definition.nodes.filter(node => node.output.path === 'resolution')
  expect(candidates.map(node => [node.layer, node.audit.retention])).toEqual([
    ['conditional-rule', 'counts'],
    ['curation', 'decision'],
  ])
})

test('Place dependencies select the Place producer when its dataset also produces Addresses', () => {
  const source = (dataset: string, resourceType: string): LineageSource => ({
    sourceDatasetId: dataset === 'ds-hk-hkgov-dpo-address' ? 'dataset' : 'overture',
    datasetCode: dataset,
    resourceType,
    sourceSchemaVersion: '1.0',
    resourceReleaseId: `${dataset}-${resourceType}`,
    processingRules: null,
  })
  const sources = [
    source('ds-hk-hkgov-dpo-address', 'address'),
    source('ds-hk-overture-place', 'address'),
    source('ds-hk-overture-place', 'place'),
  ]
  const definition = compile('place', 'attributes.geometry', sources)
  const producer = definition.nodes.find(node => node.output.path === 'place')!
  expect(producer).toBeDefined()
  const input = producer.inputs.publisherRecord!
  expect(input).toMatchObject({ stage: 'raw', path: '$' })
  if (!('scope' in input)) throw new Error('Expected a scoped publisher input')
  expect(
    definition.scopes.find(scope => scope.id === input.scope.replace(/-raw$/, '')),
  ).toMatchObject({
    resourceType: 'place',
    sourceDatasetId: 'overture',
  })
  expect(() =>
    compile('place', 'attributes.geometry', [
      ...sources,
      { ...sources[2]!, resourceReleaseId: 'another-place-release' },
    ]),
  ).toThrow(
    'Expected one selected producer scope for ds-hk-overture-place/place; found 2',
  )
})

test('Place Division companions select Divisions rather than sibling geometry resources', () => {
  const definition = compile(
    'place',
    'relationships.divisions',
    [
      ...['division', 'divisionArea', 'divisionBoundary'].map(resourceType => ({
        sourceDatasetId: 'dataset',
        datasetCode: 'ds-hk-overture-division',
        resourceType,
        sourceSchemaVersion: '1.0',
        resourceReleaseId: resourceType,
        processingRules: null,
      })),
      {
        sourceDatasetId: 'places',
        datasetCode: 'ds-hk-overture-place',
        resourceType: 'place',
        sourceSchemaVersion: '1.0',
        resourceReleaseId: 'places',
        processingRules: null,
      },
    ],
    [{ origin: 'registry', fieldPath: 'selectedDivisionSnapshot' }],
  )
  const assembly = definition.nodes.filter(
    node => node.output.scope === 'canonical-place' && node.stage === 'assembly',
  )
  expect(assembly).toHaveLength(1)
  const condition = assembly[0]!.when
  if (condition.kind !== 'compare') throw new Error('Expected a source selection')
  expect(
    definition.scopes.find(scope => scope.id === condition.value)?.resourceType,
  ).toBe('division')
})

test('Place reference name and access hint have current normalisation producers', () => {
  for (const field of ['attributes.referenceName', 'attributes.i18n.en.accessHint']) {
    const definition = compile('place', field)
    expect(definition.fields[0]!.completeness).toBe('complete')
    const producer = definition.nodes.find(node => node.output.path === 'place')!
    expect(producer.inputs.publisherRecord).toMatchObject({ stage: 'raw', path: '$' })
    expect(producer.onAbsent).toBe('omit')
  }
})

test('Place associations consume only their actual dependencies', () => {
  expect(currentPlaceFieldRule('attributes.address3dId')!.inputs).toEqual([
    'unitReference',
  ])
  expect(currentPlaceFieldRule('relationships.divisions')!.inputs).toEqual([
    'divisionMembership',
  ])
  expect(currentPlaceFieldRule('attributes.addressSnapshotId')!.expression).toContain(
    'Place publication receipt',
  )
  expect(currentPlaceFieldRule('attributes.sources')!.inputs).toContain(
    'resolvedSources',
  )
})

test('curated primary names consume only their locale field, never the whole record', () => {
  const definition = compile('division', 'attributes.i18n.en.name', [
    {
      sourceDatasetId: 'dataset',
      datasetCode: 'ds-hk-saanseoi-division',
      resourceType: 'division',
      sourceSchemaVersion: '1.0',
      resourceReleaseId: 'curated',
      processingRules: null,
    },
  ])
  const assembly = definition.nodes.find(
    node => node.stage === 'assembly' && node.output.path === 'i18n.en.name',
  )!
  const values = Object.values(assembly.inputs).filter(input => input.role === 'value')
  expect(values).toHaveLength(1)
  const input = values[0]!
  if (!('node' in input)) throw Error('Expected prepared field')
  expect(definition.nodes.find(node => node.id === input.node)?.output.path).toBe(
    'record.names.en.name',
  )
})
