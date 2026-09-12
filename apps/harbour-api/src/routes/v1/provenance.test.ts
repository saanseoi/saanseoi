import { expect, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import { objectKey, retainObject, type ProvenanceStore } from '@repo/core/provenance'
import { provenanceRoutes } from './provenance.ts'
import type { AppEnv } from '../../types.ts'

test('bulk provenance checks verify content, report missing objects and bound requests', async () => {
  const contents = new Map<string, ArrayBuffer>()
  let writes = 0
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = contents.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      writes++
      contents.set(key, bytes)
    },
  }
  const first = await retainObject(store, { kind: 'fixture', value: 'retained' })
  const missing = await retainObject(store, { kind: 'fixture', value: 'missing' })
  contents.delete(objectKey(missing.hash))
  const app = new OpenAPIHono<AppEnv>()
  app.openapiRoutes(provenanceRoutes)
  const env = { R2_ASSETS: store } as AppEnv['Bindings']
  const request = (objects: unknown[]) =>
    app.request(
      '/v1/provenance/objects/check',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects }),
      },
      env,
    )
  const response = await request([first, missing])
  expect(response.status).toBe(200)
  const body = (await response.json()) as { objects: (typeof first)[] }
  expect(body.objects).toEqual([first])
  expect(writes).toBe(2)
  expect((await request(Array(65).fill(first))).status).toBe(400)
  contents.set(
    objectKey(first.hash),
    Uint8Array.from(new TextEncoder().encode('corrupt')).buffer,
  )
  expect((await request([first])).status).toBe(400)
})
