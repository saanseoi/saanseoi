import { expect, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import { PlacesListQuerySchema } from './places'
import { placeBasicCategories, placeTaxonomyCategories } from './placeFilterVocabulary'

test('publishes complete category lists in the generated query schema without restricting filters', () => {
  const app = new OpenAPIHono()
  app.openAPIRegistry.register('PlacesListQuery', PlacesListQuerySchema)
  const document = app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'Places vocabulary', version: 'test' },
  })
  const schema = document.components?.schemas?.PlacesListQuery
  if (!schema || !('properties' in schema)) throw new Error('Missing query schema')
  for (const [filter, values] of [
    ['basicCategory', placeBasicCategories],
    ['taxonomyPrimary', placeTaxonomyCategories],
    ['operatingStatus', ['open', 'temporarily_closed', 'permanently_closed']],
  ] as const) {
    const property = schema.properties?.[`filter[${filter}]`]
    if (!property || !('description' in property)) throw new Error(`Missing ${filter}`)
    for (const value of values) expect(property.description).toContain(`\`${value}\``)
    expect(property.description).not.toContain('\n- ')
    expect(property.description).not.toContain('2025-04-01')
    if (filter !== 'operatingStatus') {
      expect(property.description).toContain('Possible values: `')
    }
    expect(property).not.toHaveProperty('enum')
  }
  expect(placeBasicCategories.length).toBe(286)
  expect(placeTaxonomyCategories.length).toBe(2354)
  expect(placeBasicCategories).not.toContain('Artspace')
  expect(
    PlacesListQuerySchema.safeParse({ 'filter[basicCategory]': 'future_category' })
      .success,
  ).toBe(true)
})
