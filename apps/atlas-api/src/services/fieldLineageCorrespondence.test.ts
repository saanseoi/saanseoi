import { expect, test } from 'bun:test'
import { compileResponseField } from '../../../../libs/db/src/fieldLineageComposition'
import { evaluateFieldLineageCondition } from '../../../../libs/db/src/fieldLineageConditions'
import type { Node } from '../../../../libs/db/src/fieldLineageTypes'
import {
  createDivisionResource,
  createIncludedDivisionGeometryResource,
} from './divisionsPresentation'

function projection(resourceType: string, apiField: string) {
  return compileResponseField({
    apiVersion: 'api-divisions-v0.1',
    resourceType,
    apiField,
    inputs: {
      value: {
        stage: 'canonical',
        scope: 'canonical',
        collection: resourceType,
        path: apiField,
        role: 'value',
      },
    },
    operation: code => ({
      kind: 'resolver',
      definition: {
        store: 'lineageRuleDefinitions',
        definitionId: 'test',
        operationCode: code,
        ruleId: code,
      },
      arguments: {},
      parameters: {},
    }),
  })
}

test('Division field emission agrees with actual response profiles', () => {
  const record = {
    division: {
      id: 'division',
      level: 1,
      class: 'city',
      category: 'administrative',
      hierarchies: { full: [] },
      divisionCode: 'CODE',
      geometry: { type: 'Point', coordinates: [114, 22] },
      bbox: null,
      cartography: null,
      createdAt: 'created',
      updatedAt: 'updated',
      snapshotId: 'snapshot',
      sources: null,
      identifiers: null,
    },
    i18n: {},
  } as Parameters<typeof createDivisionResource>[0]['record']
  for (const profile of ['compact', 'default', 'map', 'full'] as const) {
    const response = createDivisionResource({
      baseUrl: 'https://example.test',
      record,
      routeState: {
        profile,
        requestedVersionPath: 'divisions/v0.1',
        requestedApiVersion: '0.1',
        resolvedApiVersion: 'api-divisions-v0.1',
        requestedApiFamily: 'divisions',
        localeSelection: { mode: 'all', locales: ['*'] },
      },
    })
    expect(response.attributes).not.toHaveProperty('bbox')
    for (const field of [
      'level',
      'class',
      'category',
      'hierarchies',
      'createdAt',

      'geometry',
      'cartography',
      'snapshotId',
      'sources',
      'identifiers',
    ]) {
      const policy = projection('division', `attributes.${field}`)
      expect(Object.hasOwn(response.attributes, field)).toBe(
        evaluateFieldLineageCondition(policy.when, { profile }),
      )
    }
  }
})

test('geometry source visibility is independent of geometry visibility', () => {
  const record = {
    id: 'geometry',
    divisionId: 'division',
    leftDivisionId: 'left',
    rightDivisionId: 'right',
    geometry: null,
    bbox: null,
    type: 'land',
    isLand: true,
    isTerritorial: false,
    variant: 'overture',
    sources: null,
    snapshotId: 'snapshot',
  } as Parameters<typeof createIncludedDivisionGeometryResource>[0]['record']
  for (const kind of ['area', 'boundary'] as const)
    for (const profile of ['compact', 'default', 'map', 'full'] as const) {
      const response = createIncludedDivisionGeometryResource({ kind, profile, record })
      expect(response.attributes).not.toHaveProperty('identifiers')
      for (const field of [
        'geometry',
        'bbox',
        'type',
        'isLand',
        'isTerritorial',
        'variant',
        'sources',
        'snapshotId',
      ]) {
        const policy = projection(
          kind === 'area' ? 'divisionArea' : 'divisionBoundary',
          `attributes.${field}`,
        )
        expect(Object.hasOwn(response.attributes, field)).toBe(
          evaluateFieldLineageCondition(policy.when, { profile }),
        )
      }
    }
})

test('unsupported response projections and unresolved conditions cannot claim passthrough', () => {
  expect(projection('division', 'attributes.nameVariant').operation.kind).toBe(
    'unresolved',
  )
  expect(() =>
    evaluateFieldLineageCondition(
      projection('division', 'attributes.nameVariant').when,
      {},
    ),
  ).toThrow('Unresolved')
  const inputs: Node['inputs'] = {}
  expect(
    compileResponseField({
      apiVersion: 'api-places-v0.1',
      resourceType: 'place',
      apiField: 'attributes.unimplementedField',
      inputs,
      operation: () => ({ kind: 'constant', value: null }),
    }).operation.kind,
  ).toBe('unresolved')
})
