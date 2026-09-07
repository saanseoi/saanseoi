import { describe, expect, test } from 'bun:test'

import {
  resolveOvertureSourceRecordFieldDefinition,
  resolveSourceRecordSchema,
} from './sourceRecordSchemas'

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
