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

test('release endpoints register and select scoped audits without an effects registry', async () => {
  const { Database } = await import('bun:sqlite')
  const { retainAuditResult, retainProcessingResult } = await import(
    '@repo/core/provenance'
  )
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE resourceReleases(id TEXT PRIMARY KEY, status TEXT);
    INSERT INTO resourceReleases VALUES ('release', 'processing');
    CREATE TABLE processingAudits(resourceReleaseId TEXT, stage TEXT, ownerId TEXT,
      manifestHash TEXT, byteLength INTEGER, applicationCount INTEGER, attemptStatus TEXT,
      PRIMARY KEY(resourceReleaseId, stage, ownerId));
  `)
  const binding = {
    prepare(sql: string) {
      const stmt = sqlite.query(sql)
      let params: import('bun:sqlite').SQLQueryBindings[] = []
      return {
        bind(...values: import('bun:sqlite').SQLQueryBindings[]) {
          params = values
          return this
        },
        async raw() {
          return stmt.values(...params)
        },
        async all() {
          return { results: stmt.all(...params), success: true }
        },
        async run() {
          stmt.run(...params)
          return { success: true }
        },
      }
    },
  }
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const value = objects.get(key)
      return value ? { arrayBuffer: async () => value } : null
    },
    async put(key, value) {
      objects.set(key, value)
    },
  }
  const app = new OpenAPIHono<AppEnv>()
  app.openapiRoutes(provenanceRoutes)
  const env = { DB_META: binding, R2_ASSETS: store } as unknown as AppEnv['Bindings']
  const path = '/v1/provenance/releases/release'
  const register = (ref: unknown) =>
    app.request(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ref),
      },
      env,
    )
  try {
    for (const stage of ['preparation', 'ingestion'] as const) {
      const audit = await retainAuditResult(store, {
        resourceReleaseId: 'release',
        scope: { stage, ownerId: 'release' },
        datasetCode: 'fixture',
        attempt: { id: stage, status: 'completed' },
        bulk: [],
        guards: [],
        individuals: [],
      })
      expect((await register(audit.ref)).status).toBe(200)
      const response = await app.request(
        `${path}?manifestHash=${audit.ref.hash}`,
        {},
        env,
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(audit.manifest)
    }
    expect((await app.request(path, {}, env)).status).toBe(400)
    const unknown = await app.request(
      `${path}?manifestHash=sha256:${'0'.repeat(64)}`,
      {},
      env,
    )
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({
      error: 'No registered audit matches this release and manifest hash.',
    })
    const effects = await retainProcessingResult(store, {
      resourceReleaseId: 'release',
      collections: [],
      applications: [],
    })
    expect((await register(effects.ref)).status).toBe(400)
    expect(sqlite.query('SELECT COUNT(*) AS n FROM processingAudits').get()).toEqual({
      n: 2,
    })
  } finally {
    sqlite.close()
  }
})
