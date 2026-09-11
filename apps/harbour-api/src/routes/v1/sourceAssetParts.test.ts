import { expect, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import {
  sourceAssetPartPreflightRoute,
  sourceAssetPartUploadRoute,
} from './sourceAssetParts'
import {
  createSourceAssetTestStore,
  hash,
} from '../../../../../libs/core/src/testing/sourceAssetStore'
import { SOURCE_ASSET_PART_SIZE } from '@repo/core/sourceAssetTransfer'
import type { AppEnv } from '../../types'

test('chunk HTTP routes enforce bounded raw bodies and return durable receipts', async () => {
  const f = createSourceAssetTestStore()
  const app = new OpenAPIHono<AppEnv>()
  app.openapiRoutes([sourceAssetPartPreflightRoute, sourceAssetPartUploadRoute])
  const env = { R2_ASSETS: f.store } as AppEnv['Bindings']
  const bytes = new Uint8Array([1, 2, 3])
  const path = `/v1/assets/parts/${'0'.repeat(64)}/${hash(bytes)}`
  expect(
    (await (await app.request(`${path}?byteLength=3`, {}, env)).json()) as unknown,
  ).toEqual({ exists: false })
  const result = await app.request(path, { method: 'PUT', body: bytes }, env)
  expect(result.status).toBe(200)
  expect((await result.json()) as unknown).toEqual({
    sha256: hash(bytes),
    byteLength: 3,
  })
  expect(
    (await (await app.request(`${path}?byteLength=3`, {}, env)).json()) as unknown,
  ).toEqual({ exists: true })
  const oversized = await app.request(
    path,
    { method: 'PUT', body: new Uint8Array(SOURCE_ASSET_PART_SIZE + 1) },
    env,
  )
  expect(oversized.status).toBe(413)
  expect(f.writes).toHaveLength(1)
})
