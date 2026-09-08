import { query, getRequestEvent } from '$app/server'
import { z } from 'zod'
import { and, eq, metaSchema } from '@repo/db'
import {
  readObject,
  readAuditPage,
  validateAuditManifest,
  type Digest,
} from '@repo/core/provenance'
import { getMetaDb } from './server'

function store() {
  const bucket = getRequestEvent().platform?.env.R2_GUIDE_ASSETS
  if (!bucket) throw new Error('Release audit storage is unavailable.')
  return bucket
}
async function manifestFor(releaseId: string, hash?: string) {
  const table = metaSchema.releaseProvenance
  const row = await getMetaDb()
    .select()
    .from(table)
    .where(eq(table.releaseId, releaseId))
    .get()
  if (!row) throw new Error('Release has no retained audit.')
  if (hash && hash !== row.manifestHash)
    throw new Error('Audit changed; reload the release before continuing.')
  const manifest = await readObject(store(), {
    hash: row.manifestHash as Digest,
    byteLength: row.byteLength,
  })
  validateAuditManifest(manifest)
  return { manifest, hash: row.manifestHash }
}

export const getRetainedSourceAudit = query(
  z.object({ datasetCode: z.string(), releaseCode: z.string() }),
  async input => {
    const {
      releaseProvenance: p,
      metaReleases: r,
      metaSourceReleases: s,
      metaDatasets: d,
    } = metaSchema
    const rows = await getMetaDb()
      .select({
        releaseId: r.id,
        code: r.code,
        resourceType: r.resourceType,
        hash: p.manifestHash,
        byteLength: p.byteLength,
      })
      .from(p)
      .innerJoin(r, eq(r.id, p.releaseId))
      .innerJoin(s, eq(s.id, r.sourceReleaseId))
      .innerJoin(d, eq(d.id, s.datasetId))
      .where(and(eq(d.code, input.datasetCode), eq(s.code, input.releaseCode)))
      .all()
    return (
      await Promise.all(
        rows.map(async row => {
          const manifest = await readObject(store(), {
            hash: row.hash as Digest,
            byteLength: row.byteLength,
          })
          if (
            !manifest ||
            typeof manifest !== 'object' ||
            Array.isArray(manifest) ||
            manifest.kind !== 'processing-audit'
          )
            return null
          validateAuditManifest(manifest)
          return { ...row, manifest }
        }),
      )
    ).filter(row => row !== null)
  },
)

export const getRetainedAuditPage = query(
  z.object({
    releaseId: z.string(),
    hash: z.string(),
    q: z.string().max(300).default(''),
    offset: z.number().int().min(0).default(0),
  }),
  async input => {
    const { manifest } = await manifestFor(input.releaseId, input.hash)
    return readAuditPage(store(), manifest, input.q, input.offset, 50)
  },
)

export const getRetainedBulkFixture = query(
  z.object({
    releaseId: z.string(),
    hash: z.string(),
    bulkId: z.string(),
    index: z.number().int().min(0),
  }),
  async input => {
    const { manifest } = await manifestFor(input.releaseId, input.hash)
    const fixture = manifest.bulk.find(b => b.id === input.bulkId)?.fixtures[
      input.index
    ]
    if (!fixture) throw new Error('Fixture is not declared by this release.')
    return readObject(store(), fixture.object)
  },
)
