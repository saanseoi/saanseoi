import { describe, expect, test } from 'bun:test'
import { routingArtifact } from './routing-artifacts'

function storage(objects: Record<string, unknown>) {
  const requested: string[] = []
  const bucket = {
    get: async (key: string) => {
      requested.push(key)
      const value = objects[key]
      return value === undefined
        ? null
        : {
            size: 12,
            httpEtag: '"sample"',
            body: new Blob(['sample bytes']).stream(),
            json: async () => value,
          }
    },
  } as unknown as R2Bucket
  return { env: { BUCKET: bucket, SOURCES: bucket }, requested }
}

describe('public routing artefacts', () => {
  test('PMTiles and JSON downloads use no-store while other artefacts retain short caching', async () => {
    const { env } = storage({
      'basemap/hk/hongkong-2026-10-01.pmtiles': {},
      'routing/hk/2026-10-01/manifest.json': { status: 'available' },
      'routing/hk/2026-10-01/region.osm.pbf': {},
    })
    for (const [path, cacheControl] of [
      ['/downloads/hk/2026-10-01.pmtiles', 'no-store'],
      ['/routing/hk/2026-10-01.json', 'no-store'],
      ['/downloads/hk/2026-10-01.osm.pbf', 'public, max-age=60'],
    ]) {
      for (const method of ['GET', 'HEAD']) {
        const result = await routingArtifact(
          new Request(`https://tiles.test${path}`, { method }),
          env,
        )
        expect(result?.status).toBe(200)
        expect(result?.headers.get('Cache-Control')).toBe(cacheControl)
      }
    }
  })
  test('streams archived Guangdong source without a token and supports HEAD', async () => {
    const { env, requested } = storage({
      'osm/geofabrik/guangdong/2026-10-01.osm.pbf': {},
    })
    const result = await routingArtifact(
      new Request('https://tiles.test/sources/guangdong/2026-10-01.osm.pbf', {
        method: 'HEAD',
      }),
      env,
    )
    expect(result?.status).toBe(200)
    expect(await result?.text()).toBe('')
    expect(requested).toEqual(['osm/geofabrik/guangdong/2026-10-01.osm.pbf'])
  })
  test('retired editions return 410 before opening deleted payloads', async () => {
    const { env, requested } = storage({
      'routing/hk/2026-08-01/manifest.json': { status: 'retired' },
    })
    const result = await routingArtifact(
      new Request('https://tiles.test/routing/hk/2026-08-01/valhalla.tar.gz'),
      env,
    )
    expect(result?.status).toBe(410)
    expect(requested).toHaveLength(1)
  })
  test('accepts compatibility pointers with two- or three-part engine versions', async () => {
    const { env, requested } = storage({})
    await routingArtifact(
      new Request('https://tiles.test/routing/hk/graphhopper/11.1/latest.json'),
      env,
    )
    expect(requested).toEqual(['routing/hk/graphhopper/11.1/latest.json'])
  })
  test('does not expose arbitrary bucket paths', async () => {
    const { env, requested } = storage({})
    expect(
      await routingArtifact(
        new Request('https://tiles.test/routing/hk/secrets.json'),
        env,
      ),
    ).toBeNull()
    expect(requested).toEqual([])
  })
})
