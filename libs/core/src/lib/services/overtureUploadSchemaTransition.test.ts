import { expect, test } from 'bun:test'
import { resolveSourceRecordSchema } from '../../sourceRecordSchemas'
import { matchesOctoberOvertureSchemaTransition } from './overtureUploadSchemaTransition'

for (const resourceType of [
  'division',
  'divisionArea',
  'divisionBoundary',
  'place',
] as const) {
  test(`October ${resourceType} accepts only the exact reviewed physical transition`, () => {
    const previous = {
      source: 'overture',
      datasetCode:
        resourceType === 'place' ? 'ds-hk-overture-place' : 'ds-hk-overture-division',
      resourceType,
      sourceVersion: '2026-09-23.0',
    }
    const next = { ...previous, sourceVersion: '2026-10-21.0' }
    const before = resolveSourceRecordSchema(previous)!.fields
    const after = resolveSourceRecordSchema(next)!.fields
    const check = (fields = after, prior = before) =>
      matchesOctoberOvertureSchemaTransition(previous, next, prior, fields)
    expect(before.every(field => field.nullable)).toBe(true)
    expect(after.find(field => field.name === 'id')?.nullable).toBe(false)
    expect(check()).toBe(true)
    expect(check(after.toReversed())).toBe(true)
    expect(
      check(
        after.map(field =>
          field.name === 'id' ? { ...field, nullable: true } : field,
        ),
      ),
    ).toBe(false)
    expect(
      check(
        after.map(field =>
          field.name === 'id' ? { ...field, type: 'int_64' } : field,
        ),
      ),
    ).toBe(false)
    expect(check(after.slice(1))).toBe(false)
    expect(
      check([...after, { name: 'unexpected', type: 'utf8', nullable: true }]),
    ).toBe(false)
    expect(
      check(
        after,
        before.map(field =>
          field.name === 'id' ? { ...field, nullable: false } : field,
        ),
      ),
    ).toBe(false)
    expect(
      matchesOctoberOvertureSchemaTransition(
        previous,
        { ...next, datasetCode: 'other' },
        before,
        after,
      ),
    ).toBe(false)
    expect(
      matchesOctoberOvertureSchemaTransition(
        previous,
        { ...next, sourceVersion: '2026-11-18.0' },
        before,
        after,
      ),
    ).toBe(false)
    expect(matchesOctoberOvertureSchemaTransition(next, previous, after, before)).toBe(
      false,
    )
  })
}
