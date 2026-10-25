import {
  mirrorRoot,
  publishDivisionMirror,
  type MirroredManifest,
} from '@repo/core/exports/mirror'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { timingSafeEqual } from 'node:crypto'
import { serveReleaseExport } from '@repo/core/exports/canonical'
import { createMetaDb, createHistoryDb } from '@repo/db'
import { listApiReleaseSetSnapshots } from '@repo/core/db/metaRegistry'
import { listExportReleases, expireReleaseExports } from '@repo/core/exports/retention'
import { prepareReleaseExports } from '@repo/core/exports/prepare'
import { prepareStreetMock } from '@repo/core/exports/streetsMock'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay.ts'
import type { ExportSelection } from '@repo/core/exports/contracts'
import {
  alphaDigest,
  buildingAlphaRoot,
  publishBuildingAlpha,
} from '@repo/core/exports/buildingsAlpha'

type Env = {
  Bindings: CloudflareBindings & {
    EXPORT_PUBLISH_KEY?: string
    ALLOW_EXPORT_MIRRORS?: string
  }
  Variables: { metaDb: ReturnType<typeof createMetaDb> }
}
const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('metaDb', createMetaDb(c.env.DB_META))
  await next()
})
app.use('*', cors({ origin: '*' }))
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})
// Uploads are restricted to immutable, checksum-addressed Buildings alpha files.
app.use('/buildings/v0.1/exports/_*', async (c, next) => {
  const expected = c.env.EXPORT_PUBLISH_KEY
  const supplied = Buffer.from(
    c.req.header('Authorization')?.replace(/^Bearer /, '') ?? '',
  )
  const expectedBytes = Buffer.from(expected ?? '')
  if (
    !expected ||
    supplied.length !== expectedBytes.length ||
    !timingSafeEqual(supplied, expectedBytes)
  )
    return c.json({ error: 'unauthorised' }, 401)
  await next()
})
app.put(
  '/buildings/v0.1/exports/_upload',
  bodyLimit({ maxSize: 8 * 1024 * 1024 }),
  async c => {
    const key = c.req.query('key') ?? ''
    const root = key.startsWith(buildingAlphaRoot)
      ? buildingAlphaRoot
      : c.env.ALLOW_EXPORT_MIRRORS === 'true' && key.startsWith(mirrorRoot)
        ? mirrorRoot
        : null
    if (!root) return c.json({ error: 'invalid_key' }, 400)
    const pattern =
      root === buildingAlphaRoot
        ? /^overture-\d{4}-\d{2}-\d{2}\.\d+-alpha-[a-f0-9]{16}\/(?:names|points|addresses)\/\d{5}-([a-f0-9]{64})\.(json|ndjson)$/
        : /^[a-f0-9-]{36}\/(?:names|hierarchies|points|geometry)\/\d{5}-([a-f0-9]{64})\.(json|ndjson)$/
    const match = pattern.exec(key.slice(root.length))
    if (!match) return c.json({ error: 'invalid_key' }, 400)
    const bytes = await c.req.arrayBuffer()
    const sha256 = await alphaDigest(bytes)
    if (sha256 !== match[1]) return c.json({ error: 'checksum_mismatch' }, 400)
    const stored = await c.env.R2_ASSETS.put(key, bytes, {
      onlyIf: { etagDoesNotMatch: '*' },
      sha256,
      httpMetadata: {
        contentType: match[2] === 'json' ? 'application/json' : 'application/x-ndjson',
        cacheControl: 'no-store',
      },
    })
    if (!stored) {
      const existing = await c.env.R2_ASSETS.get(key)
      if (!existing || (await alphaDigest(await existing.arrayBuffer())) !== sha256)
        return c.json({ error: 'immutable_conflict' }, 409)
    }
    return c.json({ key, sha256, byteLength: bytes.byteLength })
  },
)
app.post(
  '/buildings/v0.1/exports/_publish',
  bodyLimit({ maxSize: 256 * 1024 }),
  async c => {
    const index = await publishBuildingAlpha(c.env.R2_ASSETS, await c.req.json())
    return c.json({ retained: index.releases.slice(0, 2) })
  },
)

app.post('/buildings/v0.1/exports/_prepare', bodyLimit({ maxSize: 1024 }), async c => {
  const body = await c.req.json<{ family: string; dryRun?: boolean }>()
  if (!['divisions', 'streets'].includes(body.family))
    return c.json({ error: 'invalid_family' }, 400)
  const family = body.family as 'divisions' | 'streets'
  const db = c.var.metaDb as unknown as HarbourReadableDb
  const selection: ExportSelection = {
    family,
    region: 'hk',
    domain: family === 'divisions' ? 'geographic' : 'physical',
    apiVersion: family === 'divisions' ? 'api-divisions-v0.2' : 'api-streets-v0.1',
    apiReleaseSetId: '',
    snapshots: [],
  }
  const releases = (await listExportReleases(db, selection)).slice(0, 2)
  if (body.dryRun !== false)
    return c.json({ releases, mock: family === 'streets' && !releases.length })
  if (family === 'streets' && !releases.length)
    return c.json(await prepareStreetMock(c.env.R2_ASSETS))
  const shards = new Map<string, ReplayShard>()
  for (const binding of [
    'DB_HISTORY_HK_BEFORE',
    'DB_HISTORY_HK_2025',
    'DB_HISTORY_HK_2026',
  ] as const)
    shards.set(binding, {
      bindingName: binding,
      db: createHistoryDb(c.env[binding]) as unknown as HarbourReadableDb,
    })
  const prepared: ExportSelection[] = []
  for (const release of releases) {
    const snapshots = await listApiReleaseSetSnapshots(db, release.id)
    const selected = {
      ...selection,
      apiReleaseSetId: release.id,
      snapshots: snapshots.map(row => ({
        resourceType: row.snapshotResourceType,
        snapshotId: row.snapshotId,
        variant: row.variant,
      })),
    }
    await prepareReleaseExports({
      metaDb: db,
      shards,
      bucket: c.env.R2_ASSETS,
      selection: selected,
    })
    prepared.push(selected)
  }
  if (prepared[0]) await expireReleaseExports(db, c.env.R2_ASSETS, prepared[0])
  return c.json({ releases })
})

app.post(
  '/buildings/v0.1/exports/_mirror',
  bodyLimit({ maxSize: 256 * 1024 }),
  async c => {
    if (c.env.ALLOW_EXPORT_MIRRORS !== 'true')
      return c.json({ error: 'mirrors_disabled' }, 404)
    await publishDivisionMirror(c.env.R2_ASSETS, await c.req.json<MirroredManifest>())
    return c.json({ prepared: true })
  },
)
app.get('/:family/:version/exports/:domain/:variant/manifest.json', serveReleaseExport)
app.get(
  '/:family/:version/exports/:domain/:variant/:projection/:file',
  serveReleaseExport,
)
app.onError((error, c) => {
  console.error('Export request failed', error.message)
  return c.json({ error: 'export_request_failed' }, 500)
})
export default app
