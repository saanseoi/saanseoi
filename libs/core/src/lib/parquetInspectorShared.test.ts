import { describe, expect, test } from 'bun:test'

import { formatFieldType, normaliseLogicalType } from './parquetInspectorShared'

describe('normaliseLogicalType', () => {
  test('normalises modern PyArrow logical type names', () => {
    expect(normaliseLogicalType('STRING')).toBe('utf8')
    expect(normaliseLogicalType('LIST')).toBe('list')
    expect(normaliseLogicalType('MAP')).toBe('map')
  })

  test('keeps extension logical types in the generic schema bucket', () => {
    expect(normaliseLogicalType('GEOMETRY')).toBe('type')
  })

  test('recognises the logical type object emitted by current PyArrow', () => {
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
