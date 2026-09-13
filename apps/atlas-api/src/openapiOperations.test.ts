import { expect, test } from 'bun:test'
import app from './index'
import type { AppBindings } from './types'
import { DivisionChangesQuerySchema } from './schema/divisionChanges'
import { divisionChangesExamples } from './schema/divisionChanges.examples'

type Operation = {
  summary?: string
  description?: string
  parameters?: Array<{ name: string; required?: boolean }>
}
type Document = { paths: Record<string, Record<string, Operation>> }
async function document(path: string): Promise<Document> {
  const response = await app.request(path, {}, {
    ATLAS_BASE_URL: 'https://api.example.test',
  } as unknown as AppBindings)
  expect(response.status).toBe(200)
  return response.json() as Promise<Document>
}

test('every public operation has a readable sidebar summary', async () => {
  for (const family of [
    'registry',
    'divisions',
    'addresses',
    'places',
    'stats',
    'streets',
  ]) {
    const doc = await document(
      family === 'registry' ? '/openapi' : `/openapi/${family}/v0.1`,
    )
    expect(Object.keys(doc.paths).length).toBeGreaterThan(0)
    for (const [path, item] of Object.entries(doc.paths))
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = item[method]
        if (operation) {
          expect(operation.summary, `${method.toUpperCase()} ${path}`).toBeString()
          expect(operation.summary!.length).toBeGreaterThan(3)
          expect(operation.summary).not.toContain('/')
        }
      }
  }
})

test('Divisions documents expose changes and concise names alongside the selected dataset version', async () => {
  for (const version of ['v0', 'v0.1', 'v1']) {
    const doc = await document(`/openapi/divisions/${version}`)
    expect(Object.keys(doc.paths).some(path => path.startsWith('/api/v1/'))).toBe(false)
    expect(doc.paths['/divisions/v1/changes']?.get?.summary).toBe(
      'List Division Changes',
    )
    expect(doc.paths['/divisions/v1/changes/definitions/{id}']?.get?.summary).toBe(
      'Get Division Change Definition',
    )
    expect(doc.paths['/divisions/v1/geocode']?.get?.summary).toBe('Geocode Division')
    if (version !== 'v1') {
      expect(doc.paths[`/divisions/${version}`]?.get?.summary).toBe('List Divisions')
      expect(doc.paths[`/divisions/${version}/search`]?.get?.summary).toBe(
        'Search Divisions',
      )
      expect(doc.paths[`/divisions/${version}/{id}`]?.get?.summary).toBe('Get Division')
      expect(doc.paths[`/divisions/${version}/source-schema`]?.get?.summary).toBe(
        'Get Division Source Schema',
      )
    }
  }
  for (const path of ['/openapi', '/openapi/addresses/v0.1'])
    expect((await document(path)).paths['/divisions/v1/changes']).toBeUndefined()
})

test('all five changes examples are valid queries included in OpenAPI', async () => {
  const doc = await document('/openapi/divisions/v0.1')
  const operation = doc.paths['/divisions/v1/changes']!.get!
  expect(divisionChangesExamples).toHaveLength(5)
  for (const example of divisionChangesExamples) {
    expect(operation.description).toContain(example.query)
    const url = new URL(example.query, 'https://example.test')
    expect(
      DivisionChangesQuerySchema.safeParse(Object.fromEntries(url.searchParams))
        .success,
    ).toBe(true)
  }
  expect(operation.parameters).toContainEqual(
    expect.objectContaining({ name: 'fromApiReleaseSet', required: true }),
  )
})
