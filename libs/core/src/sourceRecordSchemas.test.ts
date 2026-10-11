import { describe, expect, test } from 'bun:test'

import {
  resolveOvertureSourceRecordFieldDefinition,
  resolveSourceRecordSchema,
  retainedSourceSchema,
  sourceRecordRawPropertyFields,
} from './sourceRecordSchemas'
import { retainSourceProperties } from './pipeline/services/sources/retainedProperties'

test('division schemas describe retained API field names at every depth', () => {
  for (const resourceType of [
    'division',
    'divisionArea',
    'divisionBoundary',
  ] as const) {
    const source = resolveSourceRecordSchema({
      resourceType,
      source: 'overture',
      sourceVersion: '2025-11-19.0',
    })!
    const raw = {
      type: 'object',
      properties: Object.fromEntries(
        sourceRecordRawPropertyFields(source).map(field => [
          field.name,
          resolveOvertureSourceRecordFieldDefinition(source, field) ?? {},
        ]),
      ),
    }
    const before = structuredClone(raw)
    const projected = retainedSourceSchema(raw)
    const publisher = {
      sources: [
        {
          dataset: 'publisher',
          property: '/division_id',
          record_id: 'original',
          update_time: '2025-11-19',
        },
      ],
      ...(resourceType === 'division'
        ? {
            parent_division_id: 'parent',
            hierarchies: [
              [{ division_id: 'parent', name: 'Name', subtype: 'country' }],
            ],
          }
        : {
            is_land: true,
            is_territorial: true,
            ...(resourceType === 'divisionArea'
              ? { division_id: 'area' }
              : { division_ids: ['a', 'b'], is_disputed: false }),
          }),
      type:
        resourceType === 'divisionArea'
          ? 'division_area'
          : resourceType === 'divisionBoundary'
            ? 'division_boundary'
            : 'division',
    }
    const retained = retainSourceProperties(publisher) as Record<string, unknown>
    for (const name of Object.keys(retained))
      expect(projected.properties).toHaveProperty(name)
    expect(projected.properties?.sources?.items?.properties).toHaveProperty('recordId')
    expect(projected.properties?.sources?.items?.properties).toHaveProperty(
      'updateTime',
    )
    expect(projected.properties?.type?.enum).toEqual([publisher.type])
    expect((retained.sources as Array<Record<string, unknown>>)[0]?.property).toBe(
      '/division_id',
    )
    if (resourceType === 'division') {
      expect(
        projected.properties?.hierarchies?.items?.items?.properties,
      ).toHaveProperty('divisionId')
      expect(projected.properties?.hierarchies?.items?.items?.required).toContain(
        'divisionId',
      )
    }
    expect(raw).toEqual(before)
    expect(source.fields.some(field => field.name.includes('_'))).toBe(true)
  }
})

test('schema projection preserves dictionary keys and projects their object values', () => {
  const projected = retainedSourceSchema({
    properties: {
      common: {
        properties: { 'zh-Hant': { type: 'string' }, en_US: { type: 'string' } },
        required: ['en_US'],
      },
      entries: {
        additionalProperties: {
          properties: { record_id: { type: 'string' } },
          required: ['record_id'],
        },
      },
    },
  })
  expect(projected.properties?.common?.properties).toHaveProperty('en_US')
  expect(projected.properties?.common?.required).toEqual(['en_US'])
  expect(projected.properties?.entries?.additionalProperties).toMatchObject({
    properties: { recordId: { type: 'string' } },
    required: ['recordId'],
  })
})

describe('source record schemas', () => {
  test('resolves the initial Overture Places payload fields', () => {
    const schema = resolveSourceRecordSchema({
      resourceType: 'place',
      source: 'overture',
      sourceVersion: '2025-09-24.0',
    })

    expect(schema?.id).toBe('overture-place-v2025-09-24.0')
    expect(
      schema?.fields.find(field => field.name === 'basic_category'),
    ).toBeUndefined()
    expect(schema?.fields.find(field => field.name === 'taxonomy')).toBeUndefined()
  })

  test('resolves the intermediate Overture Places payload fields', () => {
    const schema = resolveSourceRecordSchema({
      resourceType: 'place',
      source: 'overture',
      sourceVersion: '2025-10-22.0',
    })

    expect(schema?.id).toBe('overture-place-v2025-10-22.0')
    expect(schema?.fields).toContainEqual({
      name: 'basic_category',
      nullable: true,
      type: 'utf8',
    })
    expect(schema?.fields.find(field => field.name === 'taxonomy')).toBeUndefined()
  })

  test('resolves the taxonomy Overture Places payload fields', () => {
    const schema = resolveSourceRecordSchema({
      resourceType: 'place',
      source: 'overture',
      sourceVersion: '2025-12-17.0',
    })

    expect(schema?.id).toBe('overture-place-v2025-12-17.0')
    expect(schema?.fields).toContainEqual({
      name: 'taxonomy',
      nullable: true,
      type: 'struct',
    })
  })

  test('resolves the 2025 Overture division payload fields', () => {
    const schema = resolveSourceRecordSchema({
      resourceType: 'division',
      source: 'overture',
      sourceVersion: '2025-09-24.0',
    })

    expect(schema?.id).toBe('overture-division-v2025-09-24.0')
    expect(schema?.fields).toContainEqual({
      name: 'hierarchies',
      nullable: true,
      type: 'list',
    })
    expect(schema?.fields.find(field => field.name === 'admin_level')).toBeUndefined()
  })

  test('resolves the later Overture division payload fields', () => {
    const schema = resolveSourceRecordSchema({
      resourceType: 'division',
      source: 'overture',
      sourceVersion: '2026-08-19.0',
    })

    expect(schema?.id).toBe('overture-division-v2026-02-18.0')
    expect(schema?.fields).toContainEqual({
      name: 'admin_level',
      nullable: true,
      type: 'int_32',
    })
  })

  test('resolves every published Overture division resource', () => {
    for (const resourceType of ['divisionArea', 'divisionBoundary'] as const) {
      const schema = resolveSourceRecordSchema({
        resourceType,
        source: 'overture',
        sourceVersion: '2026-08-19.0',
      })

      expect(schema).not.toBeNull()
      expect(schema?.fields.find(field => field.name === 'admin_level')).toEqual({
        name: 'admin_level',
        nullable: true,
        type: 'int_32',
      })
    }
  })

  test('provides the publisher’s nested definitions for raw source fields', () => {
    const schema = resolveSourceRecordSchema({
      resourceType: 'place',
      source: 'overture',
      sourceVersion: '2026-08-19.0',
    })
    const taxonomy = schema?.fields.find(field => field.name === 'taxonomy')
    const definition =
      schema && taxonomy
        ? resolveOvertureSourceRecordFieldDefinition(schema, taxonomy)
        : null

    expect(definition).toMatchObject({
      properties: {
        hierarchy: { items: { pattern: '^[a-z0-9]+(_[a-z0-9]+)*$', type: 'string' } },
        primary: { type: 'string' },
      },
      required: ['primary', 'hierarchy'],
      type: 'object',
    })
  })

  test('does not claim a typed schema for an unsupported source payload', () => {
    expect(
      resolveSourceRecordSchema({
        resourceType: 'division',
        source: 'hkgov-had',
        sourceVersion: '2022',
      }),
    ).toBeNull()
  })
})

test('public raw properties exclude envelope fields without changing upload validation', () => {
  for (const resourceType of [
    'place',
    'division',
    'divisionArea',
    'divisionBoundary',
  ] as const) {
    const schema = resolveSourceRecordSchema({
      resourceType,
      source: 'overture',
      sourceVersion: '2025-10-22.0',
    })!
    expect(schema).toBeDefined()
    const fields = sourceRecordRawPropertyFields(schema).map(field => field.name)
    for (const name of ['id', 'geometry']) {
      expect(fields).not.toContain(name)
      expect(schema.fields.some(field => field.name === name)).toBe(true)
    }
    expect(fields).toContain('sources')
    expect(fields).toContain('bbox')
  }
})
