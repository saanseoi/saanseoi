import { expect, test } from 'bun:test'
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import {
  DivisionsListQuerySchema,
  DivisionGeometryResourceSchema,
} from '../schema/divisions'
import { hasDivisionStubVariant, listDivisionStubAreas } from './divisionStubAreas'
import type { StubAreas } from '@repo/core/pipeline/services/divisions/geographicReview.ts'

test('stub is explicit, cohort-scoped, and absent from public OpenAPI variant lists', () => {
  expect(DivisionsListQuerySchema.safeParse({ include: 'areas:stub' }).success).toBe(
    true,
  )
  expect(DivisionsListQuerySchema.safeParse({ include: 'areas:made-up' }).success).toBe(
    false,
  )
  expect(hasDivisionStubVariant('geographic', '2026-08-19.0')).toBe(true)
  expect(hasDivisionStubVariant('hkgov-pland-pu', '2026-08-19.0')).toBe(false)
  expect(hasDivisionStubVariant('geographic', '2025-09-24.0')).toBe(false)
  const registry = new OpenAPIRegistry()
  registry.register('Query', DivisionsListQuerySchema)
  registry.register('Geometry', DivisionGeometryResourceSchema)
  const doc = new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.0',
    info: { title: 'test', version: '1' },
  })
  expect(JSON.stringify(doc)).not.toContain('stub')
})
test('stub records are selected by division identity without source catalogue claims', () => {
  const id = '3707878f-080b-42cf-aecf-89fef56a066a'
  const data: StubAreas = {
    type: 'FeatureCollection',
    schemaVersion: 1,
    region: 'hk',
    domain: 'geographic',
    cohort: '2026-08-19.0',
    variant: 'stub',
    features: [
      {
        type: 'Feature',
        properties: { divisionId: id, variant: 'stub' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [114, 22],
              [114.1, 22],
              [114.1, 22.1],
              [114, 22],
            ],
          ],
        },
      },
    ],
  }
  const rows = listDivisionStubAreas([id], data)
  expect(rows[0]).toMatchObject({
    divisionId: id,
    variant: 'stub',
    sources: null,
    isLand: null,
    isTerritorial: null,
  })
  expect(rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(listDivisionStubAreas([], data)).toEqual([])
})
