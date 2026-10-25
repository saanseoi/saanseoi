import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { exportFixture } from '../../libs/core/src/exports/fixtures.test-support'
import {
  buildingAlphaRoot,
  publishBuildingAlpha,
  type BuildingAlphaManifest,
} from '../../libs/core/src/exports/buildingsAlpha'
import app from './src/index'

const hash = (text: string): string => createHash('sha256').update(text).digest('hex')

/** Build a complete immutable release whose three projections share one building.
 * @param f Isolated export fixture.
 * @returns A manifest and files ready for publication validation.
 */
function detailCandidate(f: ReturnType<typeof exportFixture>): BuildingAlphaManifest {
  const rows = {
    names: [
      {
        id: 'gers',
        name: 'Tower',
        names: { en: 'Tower', 'zh-Hant': null, 'zh-Hans': null },
      },
    ],
    points: [{ id: 'gers', coordinates: [114.1, 22.3] }],
    addresses: [
      {
        id: 'gers',
        addresses: [
          {
            id: 'address',
            snapshotId: 'snapshot',
            display: { en: '12 Main Street' },
            match: 'point-in-footprint',
          },
        ],
      },
    ],
  }
  const contentSha256 = hash(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(rows).map(([key, values]) => [
          key,
          hash(JSON.stringify(values)),
        ]),
      ),
    ),
  )
  const exportReleaseId = `overture-2026-09-23.1-alpha-${contentSha256.slice(0, 16)}`
  const projection = (
    name: keyof typeof rows,
  ): BuildingAlphaManifest['projections']['names'] => ({
    status: 'ready',
    recordCount: 1,
    files: (['json', 'ndjson'] as const).map(format => {
      const body =
        format === 'json'
          ? JSON.stringify(rows[name])
          : `${JSON.stringify(rows[name][0])}\n`
      const key = `${buildingAlphaRoot}${exportReleaseId}/${name}/00000-${hash(body)}.${format}`
      f.objects.set(key, { body })
      return {
        key,
        sha256: hash(body),
        byteLength: Buffer.byteLength(body),
        recordCount: 1,
        format,
        envelope: format === 'json' ? 'array' : 'records',
        mediaType: format === 'json' ? 'application/json' : 'application/x-ndjson',
        minId: 'gers',
        maxId: 'gers',
      }
    }),
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
    exportReleaseId,
    source: {
      publisher: 'overture',
      release: '2026-09-23.1',
      sha256: 'a'.repeat(64),
      scope: 'hk-retained-clipsmart',
      recordCount: 1,
      recipe: 'overture-building-details-alpha-v2',
      contentSha256,
    },
    addressSource: {
      sha256: 'b'.repeat(64),
      publications: [{ scopeId: 'scope', snapshotId: 'snapshot' }],
      association: 'point-in-footprint',
      recordCount: 1,
    },
    locales: ['en', 'zh-Hant', 'zh-Hans'],
    namePolicy:
      'primary-unclassified; explicit-common-language-tags-only; no-translation',
    coverage: {
      allBuildings: 1,
      withPrimaryName: 1,
      withLocaleName: 1,
      withAddressCandidates: 1,
    },
    attribution: [{ name: 'Overture', url: 'https://overturemaps.org' }],
    projections: {
      names: projection('names'),
      points: projection('points'),
      addresses: projection('addresses'),
    },
  }
}

test('detail publication serves release-pinned ID ranges and address candidates with CORS', async () => {
  const f = exportFixture()
  try {
    const candidate = detailCandidate(f)
    await publishBuildingAlpha(f.bucket, candidate)
    const env = { R2_ASSETS: f.bucket, DB_META: {} as D1Database }
    for (const projection of ['names', 'points', 'addresses']) {
      const response = await app.request(
        `http://api.atlas.localhost/buildings/v0.1/exports/physical/overture/${projection}/manifest.json?release=${candidate.exportReleaseId}`,
        { headers: { Origin: 'http://hype.localhost' } },
        env,
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      const manifest = (await response.json()) as {
        exportReleaseId: string
        files: Array<{ href: string; minId: string; maxId: string }>
      }
      expect(manifest.exportReleaseId).toBe(candidate.exportReleaseId)
      expect(manifest.files[0]).toMatchObject({ minId: 'gers', maxId: 'gers' })
      expect(new URL(manifest.files[0]!.href).searchParams.get('release')).toBe(
        candidate.exportReleaseId,
      )
      const file = await app.request(manifest.files[0]!.href, {}, env)
      expect(((await file.json()) as Array<{ id: string }>)[0]?.id).toBe('gers')
    }
  } finally {
    f.meta.close()
    f.history.close()
  }
})

test('incomplete details and incorrect shard ranges cannot become discoverable', async () => {
  const f = exportFixture()
  try {
    const candidate = detailCandidate(f)
    delete candidate.projections.points
    await expect(publishBuildingAlpha(f.bucket, candidate)).rejects.toThrow(
      'Incomplete building detail projections',
    )
    const complete = detailCandidate(f)
    complete.projections.points!.files[0]!.maxId = 'wrong-id'
    await expect(publishBuildingAlpha(f.bucket, complete)).rejects.toThrow(
      'ID range mismatch',
    )
    expect(f.objects.has(`${buildingAlphaRoot}index.json`)).toBe(false)
  } finally {
    f.meta.close()
    f.history.close()
  }
})
