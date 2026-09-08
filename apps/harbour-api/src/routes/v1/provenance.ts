import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import { eq, metaSchema } from '@repo/db'
import {
  apiFieldView,
  auditView,
  curationView,
  hashValue,
  MAX_OBJECT_BYTES,
  readApplications,
  readObject,
  registerProcessingResult,
  retainObject,
  validateManifest,
  type Digest,
} from '@repo/core/provenance'
import { createPrimaryMetaRepoDb } from '../../lib/d1'
import type { AppEnv } from '../../types'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const ref = z.object({
  hash: digest,
  byteLength: z.number().int().min(1).max(MAX_OBJECT_BYTES),
})
const responses = {
  200: {
    description: 'Verified retained provenance.',
    content: { 'application/json': { schema: z.unknown() } },
  },
  400: {
    description: 'Invalid provenance.',
    content: { 'application/json': { schema: z.object({ error: z.string() }) } },
  },
} as const
const put = createRoute({
  method: 'put',
  path: '/v1/provenance/objects/{hash}',
  tags: ['Provenance'],
  request: { params: z.object({ hash: digest }) },
  responses,
})
const commit = createRoute({
  method: 'post',
  path: '/v1/provenance/releases/{releaseId}',
  tags: ['Provenance'],
  request: {
    params: z.object({ releaseId: z.string().min(1) }),
    body: { required: true, content: { 'application/json': { schema: ref } } },
  },
  responses,
})
const get = createRoute({
  method: 'get',
  path: '/v1/provenance/releases/{releaseId}',
  tags: ['Provenance'],
  request: {
    params: z.object({ releaseId: z.string().min(1) }),
    query: z.object({
      view: z
        .enum(['manifest', 'applications', 'audit', 'curations', 'api-fields'])
        .default('manifest'),
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(256).default(256),
    }),
  },
  responses,
})
const object = createRoute({
  method: 'get',
  path: '/v1/provenance/objects/{hash}',
  tags: ['Provenance'],
  request: {
    params: z.object({ hash: digest }),
    query: z.object({
      byteLength: z.coerce.number().int().min(1).max(MAX_OBJECT_BYTES),
    }),
  },
  responses,
})

const putRoute = defineOpenAPIRoute<typeof put, AppEnv>({
  route: put,
  handler: async c => {
    try {
      const reader = c.req.raw.body?.getReader()
      if (!reader) throw new Error('Missing provenance body.')
      const parts: Uint8Array[] = []
      let length = 0
      try {
        while (true) {
          const part = await reader.read()
          if (part.done) break
          length += part.value.length
          if (length > MAX_OBJECT_BYTES)
            throw new Error('Provenance object exceeds byte limit.')
          parts.push(part.value)
        }
      } finally {
        await reader.cancel()
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const part of parts) {
        bytes.set(part, offset)
        offset += part.length
      }
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      if ((await hashValue(value)) !== c.req.valid('param').hash)
        throw new Error('Object digest mismatch.')
      return c.json(await retainObject(c.env.R2_ASSETS, value), 200)
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
    }
  },
})
const commitRoute = defineOpenAPIRoute<typeof commit, AppEnv>({
  route: commit,
  handler: async c => {
    try {
      const body = c.req.valid('json')
      return c.json(
        await registerProcessingResult(
          createPrimaryMetaRepoDb(c.env.DB_META),
          c.env.R2_ASSETS,
          c.req.valid('param').releaseId,
          { ...body, hash: body.hash as Digest },
        ),
        200,
      )
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
    }
  },
})
const getRoute = defineOpenAPIRoute<typeof get, AppEnv>({
  route: get,
  handler: async c => {
    try {
      const db = createPrimaryMetaRepoDb(c.env.DB_META)
      const table = metaSchema.releaseProvenance
      const row = await db
        .select()
        .from(table)
        .where(eq(table.releaseId, c.req.valid('param').releaseId))
        .get()
      if (!row) throw new Error('Release has no retained processing result.')
      const manifest = await readObject(c.env.R2_ASSETS, {
        hash: row.manifestHash as Digest,
        byteLength: row.byteLength,
      })
      validateManifest(manifest)
      const query = c.req.valid('query')
      if (query.view === 'manifest') return c.json(manifest, 200)
      const applications = await Array.fromAsync(
        readApplications(c.env.R2_ASSETS, manifest, query.offset, query.limit),
      )
      const rows =
        query.view === 'audit'
          ? applications.map(auditView)
          : query.view === 'curations'
            ? applications.map(curationView)
            : query.view === 'api-fields'
              ? apiFieldView(applications)
              : applications
      return c.json(
        {
          manifestHash: row.manifestHash,
          offset: query.offset,
          nextOffset:
            query.offset + applications.length < manifest.applicationCount
              ? query.offset + applications.length
              : null,
          rows,
        },
        200,
      )
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
    }
  },
})
const objectRoute = defineOpenAPIRoute<typeof object, AppEnv>({
  route: object,
  handler: async c => {
    try {
      return c.json(
        await readObject(c.env.R2_ASSETS, {
          hash: c.req.valid('param').hash as Digest,
          byteLength: c.req.valid('query').byteLength,
        }),
        200,
      )
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400)
    }
  },
})
export const provenanceRoutes = [putRoute, commitRoute, getRoute, objectRoute] as const
