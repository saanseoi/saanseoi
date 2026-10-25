import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { exportFixture } from '../../libs/core/src/exports/fixtures.test-support'
import {
  buildingAlphaRoot,
  publishBuildingAlpha,
  mergeAlphaReleases,
  type BuildingAlphaManifest,
} from '../../libs/core/src/exports/buildingsAlpha'
import app from './src/index'

const hash = (text: string) => createHash('sha256').update(text).digest('hex')
function candidate(
  f: ReturnType<typeof exportFixture>,
  release = '2026-09-23.1',
): BuildingAlphaManifest {
  const rows = [
    {
      id: 'gers',
      name: '天后宮 Temple',
      names: { en: 'Temple', 'zh-Hant': null, 'zh-Hans': null },
    },
  ]
  const content = JSON.stringify(rows)
  const id = `overture-${release}-alpha-${hash(content).slice(0, 16)}`
  const files = (['json', 'ndjson'] as const).map(format => {
    const body = format === 'json' ? content : `${JSON.stringify(rows[0])}\n`
    const key = `${buildingAlphaRoot}${id}/names/00000-${hash(body)}.${format}`
    f.objects.set(key, { body })
    return {
      key,
      sha256: hash(body),
      byteLength: Buffer.byteLength(body),
      recordCount: 1,
      format,
      envelope: format === 'json' ? ('array' as const) : ('records' as const),
      mediaType:
        format === 'json'
          ? ('application/json' as const)
          : ('application/x-ndjson' as const),
    }
  })
  return {
    schemaVersion: 1,
    family: 'buildings',
    apiVersion: 'v0.1',
    domain: 'physical',
    variant: 'overture',
    region: 'hk',
    maturity: 'alpha',
    mock: false,
    apiReleaseSetId: null,
    exportReleaseId: id,
    source: {
      publisher: 'overture',
      release,
      sha256: 'a'.repeat(64),
      scope: 'hk-retained-clipsmart',
      recordCount: 1,
      recipe: 'overture-building-names-alpha-v1',
      contentSha256: hash(content),
    },
    locales: ['en', 'zh-Hant', 'zh-Hans'],
    namePolicy:
      'primary-unclassified; explicit-common-language-tags-only; no-translation',
    coverage: { allBuildings: 1, withPrimaryName: 1, withLocaleName: 1 },
    attribution: [{ name: 'Overture', url: 'https://overturemaps.org' }],
    projections: { names: { status: 'ready', recordCount: 1, files } },
  }
}

test('alpha publication verifies bytes, retries immutably, retains two, and serves pinned downloads', async () => {
  const f = exportFixture()
  try {
    const old = candidate(f, '2026-07-22.1')
    await publishBuildingAlpha(f.bucket, old)
    await publishBuildingAlpha(f.bucket, candidate(f, '2026-08-19.1'))
    const latest = candidate(f)
    await publishBuildingAlpha(f.bucket, latest)
    expect((await publishBuildingAlpha(f.bucket, latest)).releases).toHaveLength(3)
    expect([...f.objects.keys()].some(key => key.includes(old.exportReleaseId))).toBe(
      false,
    )
    const base = '/buildings/v0.1/exports/physical/overture'
    expect(
      (
        await app.request(
          '/buildings/v0.1/exports/overture/saanseoi/manifest.json',
          {},
          { R2_ASSETS: f.bucket },
        )
      ).status,
    ).toBe(404)
    const env = { R2_ASSETS: f.bucket, DB_META: {} as D1Database }
    const manifest = await app.request(`${base}/names/manifest.json`, {}, env)
    expect(manifest.status).toBe(200)
    const data = (await manifest.json()) as { files: Array<{ href: string }> }
    const file = await app.request(data.files[0]!.href, {}, env)
    expect(file.headers.get('cache-control')).toBe('no-store')
    expect(hash(await file.text())).toBe(latest.projections.names.files[0]!.sha256)
    const range = await app.request(
      data.files[0]!.href,
      { headers: { range: 'bytes=0-3' } },
      env,
    )
    expect(range.status).toBe(206)
    expect(await range.text()).toBe('[{"i')
    expect(
      (
        await app.request(
          `${base}/manifest.json?release=${old.exportReleaseId}`,
          {},
          env,
        )
      ).status,
    ).toBe(410)
    expect(
      (await app.request(`${base}/manifest.json?release=unknown`, {}, env)).status,
    ).toBe(404)
  } finally {
    f.meta.close()
    f.history.close()
  }
})

test('invalid bytes and mismatched representation parts cannot activate', async () => {
  const f = exportFixture()
  try {
    const manifest = candidate(f)
    f.objects.set(manifest.projections.names.files[0]!.key, { body: 'corrupt' })
    await expect(publishBuildingAlpha(f.bucket, manifest)).rejects.toThrow(
      'Missing alpha file',
    )
    expect(f.objects.has(`${buildingAlphaRoot}index.json`)).toBe(false)
    const valid = candidate(f)
    const file = valid.projections.names.files[1]!
    const original = f.objects.get(file.key)!
    file.key = file.key.replace('/00000-', '/00001-')
    f.objects.set(file.key, original)
    await expect(publishBuildingAlpha(f.bucket, valid)).rejects.toThrow(
      'checksum mismatch',
    )
  } finally {
    f.meta.close()
    f.history.close()
  }
})

test('upload and publish are fail-closed and keys cannot escape the alpha prefix', async () => {
  const env = { R2_ASSETS: {} as R2Bucket, EXPORT_PUBLISH_KEY: 'secret' }
  for (const [path, method] of [
    ['_upload', 'PUT'],
    ['_publish', 'POST'],
    ['_prepare', 'POST'],
    ['_mirror', 'POST'],
  ]) {
    const response = await app.request(
      `/buildings/v0.1/exports/${path}`,
      { method },
      env,
    )
    expect(response.status).toBe(401)
  }
  const response = await app.request(
    '/buildings/v0.1/exports/_upload?key=other/key',
    { method: 'PUT', headers: { Authorization: 'Bearer secret' } },
    env,
  )
  expect(response.status).toBe(400)
})

test('new corrections lead their cohort and retrying predecessors preserves order', () => {
  const a = { id: 'old', sourceRelease: '2026-09-23.1', manifestSha256: 'a' }
  const b = { id: 'correction', sourceRelease: '2026-09-23.1', manifestSha256: 'b' }
  const initial = {
    schemaVersion: 1 as const,
    maturity: 'alpha' as const,
    releases: [a],
  }
  const corrected = mergeAlphaReleases(initial, b)
  expect(corrected.releases.map(row => row.id)).toEqual(['correction', 'old'])
  expect(mergeAlphaReleases(corrected, a)).toEqual(corrected)
})
