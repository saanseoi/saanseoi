import { expect, test } from 'bun:test'
import { auditStageEntries, groupAuditStages } from './auditStages'

test('groups shuffled audit manifests by pipeline stage and resource type', () => {
  const resource = (stage: string, resourceType: string) => ({
    resourceType,
    manifest: { scope: { stage } },
  })
  const input = [
    resource('ingestion', 'divisionArea'),
    resource('preparation', 'divisionBoundary'),
    resource('ingestion', 'division'),
    resource('preparation', 'divisionArea'),
    resource('ingestion', 'divisionBoundary'),
    resource('preparation', 'division'),
  ]
  const original = [...input]
  expect(
    groupAuditStages(input).map(stage => ({
      id: stage.id,
      types: stage.resources.map(item => item.resourceType),
    })),
  ).toEqual(
    ['preparation', 'ingestion'].map(id => ({
      id,
      types: ['division', 'divisionArea', 'divisionBoundary'],
    })),
  )
  expect(input).toEqual(original)
})

test('preserves multiple manifests and does not invent missing stages', () => {
  const input = ['address', 'address', 'place'].map(resourceType => ({
    resourceType,
    manifest: { scope: { stage: 'ingestion' } },
  }))
  expect(groupAuditStages(input)).toEqual([{ id: 'ingestion', resources: input }])
  expect(groupAuditStages([])).toEqual([])
})

test('shows missing stage evidence without inventing a manifest', () => {
  const resource = { resourceType: 'division', hash: 'preparation-division' }
  expect(
    auditStageEntries({ id: 'preparation', resources: [resource] }, [
      'division',
      'divisionArea',
      'divisionBoundary',
    ]),
  ).toEqual([
    { key: resource.hash, resourceType: 'division', resource },
    {
      key: 'preparation-divisionArea',
      resourceType: 'divisionArea',
      resource: undefined,
    },
    {
      key: 'preparation-divisionBoundary',
      resourceType: 'divisionBoundary',
      resource: undefined,
    },
  ])
})
