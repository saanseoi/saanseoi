import { describe, expect, test } from 'bun:test'

import { formatFieldType, normalizeLogicalType } from './parquetInspectorShared'

describe('normalizeLogicalType', () => {
  test('normalizes modern PyArrow logical type names', () => {
    expect(normalizeLogicalType('STRING')).toBe('utf8')
    expect(normalizeLogicalType('LIST')).toBe('list')
    expect(normalizeLogicalType('MAP')).toBe('map')
  })

  test('keeps extension logical types in the generic schema bucket', () => {
    expect(normalizeLogicalType('GEOMETRY')).toBe('type')
  })

  test('recognizes the logical type object emitted by current PyArrow', () => {
    expect(
      formatFieldType({
        element: { logical_type: { type: 'STRING' } },
      }),
    ).toBe('utf8')
    expect(
      formatFieldType({
        element: { logical_type: { type: 'LIST' } },
      }),
    ).toBe('list')
    expect(formatFieldType({ element: { type: 'INT32' } })).toBe('int_32')
  })
})
