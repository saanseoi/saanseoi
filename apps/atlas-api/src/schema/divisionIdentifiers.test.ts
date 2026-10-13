import { expect, test } from 'bun:test'
import { DivisionGeometryResourceSchema, DivisionResourceSchema } from './divisions'
import { saanseoiDivisionSourceFields } from '../services/saanseoiDivisionSourceSchema'

test('division schemas require publisher objects and describe identifier types', () => {
  const schema = DivisionResourceSchema.shape.attributes.shape.identifiers
  expect(
    schema.parse({
      'hkgov-landsd': { geoNameId: ['001', '42'] },
      saanseoi: { sourceId: 'LANDSD:PLACE_NAME:001' },
    }),
  ).toEqual({
    'hkgov-landsd': { geoNameId: ['001', '42'] },
    saanseoi: { sourceId: 'LANDSD:PLACE_NAME:001' },
  })
  expect(schema.safeParse({ 'LANDSD:GEO_NAME_ID': '001' }).success).toBe(false)
  expect(schema.safeParse({ saanseoiIsland: { sourceId: 'x' } }).success).toBe(false)
  expect(schema.safeParse({ 'hkgov-landsd': { GEO_NAME_ID: '001' } }).success).toBe(
    false,
  )
  expect(schema.safeParse(null).success).toBe(true)
  expect(saanseoiDivisionSourceFields.identifiers).toMatchObject({
    type: 'object',
    'x-additionalPropertiesName': 'publisher code',
    additionalProperties: {
      type: 'object',
      'x-additionalPropertiesName': 'identifier type',
    },
  })
})

test('division and geometry identifiers preserve scalar and multiple matching codes', () => {
  const schemas = [
    DivisionResourceSchema.shape.attributes.shape.identifiers,
    ...DivisionGeometryResourceSchema.options.map(
      resource => resource.shape.attributes.shape.identifiers,
    ),
  ]
  for (const schema of schemas) {
    expect(schema.parse({ 'hkgov-landsd': { geoNameId: ['001', 42] } })).toEqual({
      'hkgov-landsd': { geoNameId: ['001', 42] },
    })
    expect(
      schema.safeParse({ saanseoi: { sourceId: { nested: 'value' } } }).success,
    ).toBe(false)
    expect(schema.safeParse({ saanseoi: { sourceId: true } }).success).toBe(false)
  }
})

test('SaanSeoi source references use the canonical flat attribution schema', () => {
  const sources = saanseoiDivisionSourceFields.sources!
  expect(sources.type).toBe('array')
  expect(sources.items?.properties).toHaveProperty('publisherCode')
  expect(sources.items?.properties).not.toHaveProperty('componentIndexes')
  expect(sources.items?.additionalProperties).toBe(false)
})
