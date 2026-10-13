import { expect, test } from 'bun:test'
import { camelCaseJson } from './jsonKeys'

test('projects inherited fields recursively without changing values or dictionary keys', () => {
  const input = {
    cartography: { min_zoom: 5, max_zoom: 24, nested_hint: { sort_key: 2 } },
    sources: {
      provider_code: [
        {
          record_id: 'source_id',
          update_time: 'today',
          nested_data: [{ source_id: 'x' }],
        },
      ],
    },
    names: { 'zh-hant': { name_alts: ['island_group'] } },
    identifiers: { 'LANDSD:GEO_NAME_ID': '1', upstream_id: { source_id: 'x' } },
    values: { QTR_PRH: '10', t_ma: '3' },
    dimensions: { housing_sector: 'public_rental' },
    field_sources: { t_ma: { source_release_id: 'release' } },
    hierarchies: { full: [[{ full_containment: false }]] },
  }
  const original = structuredClone(input)
  expect(camelCaseJson(input)).toEqual({
    cartography: { minZoom: 5, maxZoom: 24, nestedHint: { sortKey: 2 } },
    sources: {
      provider_code: [
        { recordId: 'source_id', updateTime: 'today', nestedData: [{ sourceId: 'x' }] },
      ],
    },
    names: { 'zh-hant': { nameAlts: ['island_group'] } },
    identifiers: { 'LANDSD:GEO_NAME_ID': '1', upstream_id: { sourceId: 'x' } },
    values: { QTR_PRH: '10', t_ma: '3' },
    dimensions: { housing_sector: 'public_rental' },
    fieldSources: { t_ma: { sourceReleaseId: 'release' } },
    hierarchies: { full: [[{ fullContainment: false }]] },
  })
  expect(input).toEqual(original)
  expect(camelCaseJson(camelCaseJson(input))).toEqual(camelCaseJson(input))
})

test('does not silently overwrite colliding fields', () => {
  expect(() =>
    camelCaseJson({ sources: { overture: [{ record_id: 'a', recordId: 'b' }] } }),
  ).toThrow('JSON field collision')
})

test('preserves nulls, arrays and JSON keys without prototype mutation', () => {
  const input: Record<string, unknown> = JSON.parse(
    '{"__proto__":{"record_id":"x"},"value_list":[null,false,0]}',
  )
  const result = camelCaseJson(input)
  expect(Object.hasOwn(result, '__proto__')).toBe(true)
  expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toEqual({
    recordId: 'x',
  })
  expect(result.valueList).toEqual([null, false, 0])
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
})
