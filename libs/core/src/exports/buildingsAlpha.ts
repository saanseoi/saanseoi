import { verifyBuildingProjections } from './buildingProjection'
import { z } from 'zod'

export const buildingAlphaRoot = 'exports/alpha/buildings/v0.1/hk/physical/overture/'
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const releaseId = z
  .string()
  .regex(/^overture-\d{4}-\d{2}-\d{2}\.\d+-alpha-[a-f0-9]{16}$/)
const fileSchema = z.object({
  key: z.string(),
  format: z.enum(['json', 'ndjson']),
  envelope: z.enum(['array', 'records']),
  mediaType: z.enum(['application/json', 'application/x-ndjson']),
  recordCount: z.number().int().nonnegative(),
  byteLength: z
    .number()
    .int()
    .positive()
    .max(8 * 1024 * 1024),
  sha256: digest,
  minId: z.string().optional(),
  maxId: z.string().optional(),
})
const projectionSchema = z.object({
  status: z.literal('ready'),
  recordCount: z.number().int().nonnegative(),
  files: z.array(fileSchema).min(2).max(200),
})
export const BuildingAlphaManifestSchema = z.object({
  schemaVersion: z.literal(1),
  family: z.literal('buildings'),
  apiVersion: z.literal('v0.1'),
  domain: z.literal('physical'),
  variant: z.literal('overture'),
  region: z.literal('hk'),
  maturity: z.literal('alpha'),
  mock: z.literal(false),
  apiReleaseSetId: z.null(),
  exportReleaseId: releaseId,
  source: z.object({
    publisher: z.literal('overture'),
    release: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
    sha256: digest,
    scope: z.literal('hk-retained-clipsmart'),
    recordCount: z.number().int().nonnegative(),
    recipe: z.enum([
      'overture-building-names-alpha-v1',
      'overture-building-details-alpha-v2',
    ]),
    contentSha256: digest,
  }),
  addressSource: z
    .object({
      sha256: digest,
      publications: z.array(z.object({ scopeId: z.string(), snapshotId: z.string() })),
      association: z.literal('point-in-footprint'),
      recordCount: z.number().int().nonnegative(),
    })
    .optional(),
  locales: z.tuple([z.literal('en'), z.literal('zh-Hant'), z.literal('zh-Hans')]),
  namePolicy: z.literal(
    'primary-unclassified; explicit-common-language-tags-only; no-translation',
  ),
  coverage: z.object({
    allBuildings: z.number().int().nonnegative(),
    withPrimaryName: z.number().int().nonnegative(),
    withLocaleName: z.number().int().nonnegative(),
    withAddressCandidates: z.number().int().nonnegative().optional(),
  }),
  attribution: z.array(z.object({ name: z.string(), url: z.string().url() })).min(1),
  projections: z.object({
    names: projectionSchema,
    points: projectionSchema.optional(),
    addresses: projectionSchema.optional(),
  }),
})
export type BuildingAlphaManifest = z.infer<typeof BuildingAlphaManifestSchema>
const entrySchema = z.object({
  id: releaseId,
  sourceRelease: z.string(),
  manifestSha256: digest,
})
export const BuildingAlphaIndexSchema = z.object({
  schemaVersion: z.literal(1),
  maturity: z.literal('alpha'),
  releases: z.array(entrySchema),
})
export type BuildingAlphaIndex = z.infer<typeof BuildingAlphaIndexSchema>

/** Hash exact bytes for publication verification; alpha exports do not mint an API release. */
export async function alphaDigest(bytes: ArrayBuffer): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** Order source releases numerically, keeping corrections ahead of older source cohorts. */
export function mergeAlphaReleases(
  index: BuildingAlphaIndex,
  entry: BuildingAlphaIndex['releases'][number],
): BuildingAlphaIndex {
  const existing = index.releases.find(row => row.id === entry.id)
  if (existing && existing.manifestSha256 !== entry.manifestSha256)
    throw new Error('Immutable alpha release conflict')
  // A new correction leads its source cohort; retrying an existing release never reorders it.
  const releases = (existing ? [...index.releases] : [entry, ...index.releases]).sort(
    (a, b) => b.sourceRelease.localeCompare(a.sourceRelease, 'en', { numeric: true }),
  )
  return { schemaVersion: 1, maturity: 'alpha', releases }
}

/** Verify uploaded representations, publish a CAS-protected latest-two index, then expire older files. */
export async function publishBuildingAlpha(
  bucket: R2Bucket,
  input: unknown,
): Promise<BuildingAlphaIndex> {
  const manifest = BuildingAlphaManifestSchema.parse(input)
  const { names } = manifest.projections
  const prefix = `${buildingAlphaRoot}${manifest.exportReleaseId}/`
  if (
    manifest.exportReleaseId !==
      `overture-${manifest.source.release}-alpha-${manifest.source.contentSha256.slice(0, 16)}` ||
    names.recordCount !== manifest.source.recordCount ||
    manifest.coverage.allBuildings !== names.recordCount
  )
    throw new Error('Alpha source inventory mismatch')
  // Validate every projection before exposing a release, including shard ranges and cross-projection IDs.
  await verifyBuildingProjections(bucket, manifest, prefix)
  const body = JSON.stringify(manifest)
  const manifestSha256 = await alphaDigest(
    new TextEncoder().encode(body).buffer as ArrayBuffer,
  )
  const manifestKey = `${prefix}manifest.json`
  const retained = await bucket.put(manifestKey, body, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256: manifestSha256,
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
  })
  if (!retained) {
    const existing = await bucket.get(manifestKey)
    if (
      !existing ||
      (await alphaDigest(await existing.arrayBuffer())) !== manifestSha256
    )
      throw new Error('Immutable alpha manifest conflict')
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await bucket.get(`${buildingAlphaRoot}index.json`)
    const index = current
      ? BuildingAlphaIndexSchema.parse(await current.json())
      : { schemaVersion: 1 as const, maturity: 'alpha' as const, releases: [] }
    const next = mergeAlphaReleases(index, {
      id: manifest.exportReleaseId,
      sourceRelease: manifest.source.release,
      manifestSha256,
    })
    const written = await bucket.put(
      `${buildingAlphaRoot}index.json`,
      JSON.stringify(next),
      {
        onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
      },
    )
    if (!written) continue
    for (const expired of next.releases.slice(2)) {
      const expiredPrefix = `${buildingAlphaRoot}${expired.id}/`
      try {
        let cursor: string | undefined
        do {
          const page = await bucket.list({ prefix: expiredPrefix, cursor, limit: 100 })
          if (page.objects.length) await bucket.delete(page.objects.map(row => row.key))
          cursor = page.truncated ? page.cursor : undefined
        } while (cursor)
      } catch (error) {
        console.error('Alpha export cleanup requires retry', {
          release: expired.id,
          error,
        })
      }
    }
    return next
  }
  throw new Error(
    'Concurrent alpha publication; retry with the same immutable manifest',
  )
}
