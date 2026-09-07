import { expect, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'
import { defaultOpenAPIHook } from '../../lib/openapi'
import type { AppEnv } from '../../types'
import { identityBridgeRoutes, IdentityBridgeQuerySchema } from './identityBridge'

test('identity lookup requires a release and validates bounded pagination', async () => {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: defaultOpenAPIHook })
  app.openapiRoutes(identityBridgeRoutes)
  const invalid = await app.request('/v0.1/identityBridge?limit=1000')
  expect(invalid.status).toBe(422)
  expect(
    IdentityBridgeQuerySchema.safeParse({
      domain: 'planning',
      releaseSet: 'r',
      resourceType: 'street',
    }).success,
  ).toBe(false)
  const document = app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'Identity lookups', version: '0.1' },
  })
  expect(document.paths?.['/v0.1/identityBridge']?.get?.operationId).toBe(
    'listIdentityBridge',
  )
})
