import { requireDefined } from '@repo/core/requireDefined'
import { describe, expect, test } from 'bun:test'
import { z } from '@hono/zod-openapi'
import { listApiFieldFixtures } from '@repo/db/apiFieldFixtures'
import { AddressDetailResponseSchema } from './addresses'
import { DivisionGeometryResourceSchema, DivisionResourceSchema } from './divisions'
import { PlacesListResponseSchema } from './places'
import { StatisticDetailResponseSchema } from './statistics'

type Schema = {
  const?: unknown
  properties?: Record<string, Schema>
  additionalProperties?: boolean | Schema
  anyOf?: Schema[]
  oneOf?: Schema[]
  items?: Schema
}

function hasPath(schema: Schema, path: string[]): boolean {
  if (path.length === 0) return true
  if (Object.keys(schema).every(key => ['description', 'title'].includes(key)))
    return true
  if (schema.anyOf?.some(branch => hasPath(branch, path))) return true
  if (schema.oneOf?.some(branch => hasPath(branch, path))) return true
  const [head, ...tail] = path
  const child = head ? schema.properties?.[head] : undefined
  if (child) return hasPath(child, tail)
  // Locale maps and explicitly open publisher payloads permit dynamic keys.
  if (schema.additionalProperties === true) return true
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    return hasPath(schema.additionalProperties, tail)
  }
  return false
}

describe('API field provenance contract paths', () => {
  test('every documented resource field exists in the public schema', () => {
    const statistics = z.toJSONSchema(StatisticDetailResponseSchema) as Schema
    const statisticField = statistics.properties?.included?.items?.anyOf?.find(
      schema => schema.properties?.type?.const === 'statistic-fields',
    )
    expect(statisticField).toBeDefined()
    const schemas: Record<string, Schema> = {
      division: z.toJSONSchema(DivisionResourceSchema) as Schema,
      divisionArea: z.toJSONSchema(DivisionGeometryResourceSchema) as Schema,
      divisionBoundary: z.toJSONSchema(DivisionGeometryResourceSchema) as Schema,
      address: requireDefined(z.toJSONSchema(AddressDetailResponseSchema).properties)
        .data as Schema,
      place: requireDefined(
        (
          requireDefined(z.toJSONSchema(PlacesListResponseSchema).properties)
            .data as Schema
        ).items,
      ),
      statistic: requireDefined(
        z.toJSONSchema(StatisticDetailResponseSchema).properties,
      ).data as Schema,
      'statistic-field': requireDefined(statisticField),
    }
    for (const fixture of listApiFieldFixtures()) {
      for (const field of fixture.fields) {
        const [resource, ...path] = field.apiField.split('.')
        const schema = resource ? schemas[resource] : undefined
        expect(schema, field.apiField).toBeDefined()
        expect(schema && hasPath(schema, path), field.apiField).toBe(true)
      }
    }
  })
})
