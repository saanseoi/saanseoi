import { expect, test } from 'bun:test'
import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { exportFixture } from './fixtures.test-support'
import {
  mirrorRoot,
  publishDivisionMirror,
  serveDivisionMirror,
  type MirroredManifest,
} from './mirror'
test('development mirrors verify bytes and cannot serve in production', async () => {
  const f = exportFixture()
  try {
    const id = '11111111-1111-1111-1111-111111111111'
    const body = '[{"id":"one"}]'
    const sha256 = createHash('sha256').update(body).digest('hex')
    const key = `${mirrorRoot}${id}/names/00000-${sha256}.json`
    const manifest: MirroredManifest = {
      schemaVersion: 1,
      apiVersion: 'api-divisions-v0.2',
      snapshots: [],
      locales: ['en', 'zh-Hant', 'zh-Hans'],
      crs: 'OGC:CRS84',
      bboxSemantics: 'canonical-saanseoi-area',
      family: 'divisions',
      domain: 'geographic',
      variant: 'saanseoi',
      region: 'hk',
      apiReleaseSetId: id,
      mirror: { sourceOrigin: 'https://api.saanseoi.hk', purpose: 'development-seed' },
      projections: {
        names: {
          status: 'ready',
          recordCount: 1,
          files: [
            {
              key,
              sha256,
              byteLength: body.length,
              format: 'json',
              mediaType: 'application/json',
              envelope: 'array',
              recordCount: 1,
            },
          ],
        },
      },
    }
    await expect(publishDivisionMirror(f.bucket, manifest)).rejects.toThrow(
      'verification',
    )
    f.objects.set(key, { body })
    await publishDivisionMirror(f.bucket, manifest)
    await publishDivisionMirror(f.bucket, manifest)
    const app = new Hono<{
      Bindings: { R2_ASSETS: R2Bucket; ALLOW_EXPORT_MIRRORS: string }
    }>()
    app.get(
      '/:family/:version/exports/:domain/:variant/:projection/:file',
      serveDivisionMirror,
    )
    const path = '/divisions/v0.2/exports/geographic/saanseoi/names/manifest.json'
    expect(
      (
        await app.request(
          path,
          {},
          { R2_ASSETS: f.bucket, ALLOW_EXPORT_MIRRORS: 'false' },
        )
      ).status,
    ).toBe(503)
    const response = await app.request(
      path,
      {},
      { R2_ASSETS: f.bucket, ALLOW_EXPORT_MIRRORS: 'true' },
    )
    expect(response.status).toBe(200)
    expect(((await response.json()) as any).mirror.purpose).toBe('development-seed')
  } finally {
    f.meta.close()
    f.history.close()
  }
})
