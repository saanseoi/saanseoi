import { expect, test } from 'bun:test'
import { listApiFieldFixtures } from './apiFieldFixtures'
import { compileAuthoringFieldLineage } from './fieldLineageAuthoring'
import { currentFieldRule } from './fieldLineageCurrentRules'

function graph(api: string) {
  const fixture = listApiFieldFixtures().find(f => f.apiVersion === api)!
  return compileAuthoringFieldLineage(fixture)[0]!.definition
}

test('official and supplementary Addresses read unit coverage from their own snapshot resource scope', () => {
  const definition = graph('api-addresses-v0.1')
  const scopes = new Map(definition.scopes.map(s => [s.id, s]))
  const producers = definition.nodes.filter(
    n => n.output.path === 'selectedAddressRecord',
  )
  expect(producers).toHaveLength(2)
  for (const node of producers) {
    const input = node.inputs.record!
    expect(input).toMatchObject({
      stage: 'canonical',
      collection: 'selected-address-version',
    })
    if ('scope' in input) expect(scopes.get(input.scope)?.resourceType).toBe('address')
  }
  for (const path of [
    'attributes.address3dCoverage',
    'relationships.units',
    'relationships.hierarchy',
  ])
    expect(definition.fields.find(f => f.apiField === path)?.completeness).toBe(
      'complete',
    )
})

test('Place Address snapshot selection closes at the retained role and publication receipt', () => {
  const definition = graph('api-places-v0.1')
  const field = definition.fields.find(
    f => f.apiField === 'attributes.addressSnapshotId',
  )!
  const closure = new Set(Object.values(field.provenance).flat())
  const nodes = definition.nodes.filter(n => closure.has(n.id))
  expect(field.completeness).toBe('complete')
  expect(nodes.find(n => n.output.path === 'addressRole')?.inputs.place).toMatchObject({
    stage: 'canonical',
    path: 'addressRole',
  })
  expect(
    nodes.find(n => n.output.path === 'placePublicationState')?.inputs.receipt,
  ).toMatchObject({ stage: 'registry', collection: 'placePublicationState' })
  expect(
    nodes
      .flatMap(n => Object.values(n.inputs))
      .some(
        input =>
          'stage' in input && input.stage === 'prepared' && input.role === 'value',
      ),
  ).toBe(false)
})

test('C&SD Division attribution names the canonical publisher, dataset and record identity', () => {
  for (const dataset of [
    'ds-hk-hkgov-censtatd-housing-market-areas-building-groups',
    'ds-hk-hkgov-censtatd-population-households-district',
  ]) {
    const rule = currentFieldRule('division', 'attributes.sources', dataset)!
    expect(rule.expression).toContain('publisher: "hkgov-censtatd"')
    expect(rule.expression).toContain('dataset: datasetCode')
    expect(rule.expression).toContain('recordId:')
    expect(rule.inputs).toContain('datasetCode')
    expect(rule.expression).not.toContain('record_id')
  }
})
