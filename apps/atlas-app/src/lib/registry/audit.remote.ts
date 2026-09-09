import { query, getRequestEvent } from '$app/server'
import { z } from 'zod'
import { and, eq, sql, metaSchema } from '@repo/db'
import {
  readObject,
  readAuditPage,
  readAuditDecision,
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
  if (!row) throw new Error('Release has no audit.')
  if (hash && hash !== row.manifestHash)
    throw new Error('Audit changed; reload the release before continuing.')
  const manifest = await readObject(store(), {
    hash: row.manifestHash as Digest,
    byteLength: row.byteLength,
  })
  validateAuditManifest(manifest)
  return { manifest, hash: row.manifestHash }
}

export const getSourceAudit = query(
  z.object({ datasetCode: z.string(), releaseCode: z.string() }),
  async input => {
    const {
      releaseProvenance: p,
      metaReleases: r,
      metaSourceReleases: s,
      metaDatasets: d,
      metaPublishers: publishers,
      metaPublisherI18n: publisherI18n,
    } = metaSchema
    const rows = await getMetaDb()
      .select({
        releaseId: r.id,
        code: r.code,
        resourceType: r.resourceType,
        sourcePublisherName: sql<string>`coalesce((select ${publisherI18n.name} from ${publisherI18n} where ${publisherI18n.publisherId} = ${publishers.id} and ${publisherI18n.locale} = 'en' limit 1), ${publishers.code})`,
        sourcePublisherShortName: sql<string>`coalesce((select ${publisherI18n.nameShort} from ${publisherI18n} where ${publisherI18n.publisherId} = ${publishers.id} and ${publisherI18n.locale} = 'en' limit 1), (select ${publisherI18n.name} from ${publisherI18n} where ${publisherI18n.publisherId} = ${publishers.id} and ${publisherI18n.locale} = 'en' limit 1), ${publishers.code})`,
        sourceSubType: d.subType,
        hash: p.manifestHash,
        byteLength: p.byteLength,
      })
      .from(p)
      .innerJoin(r, eq(r.id, p.releaseId))
      .innerJoin(s, eq(s.id, r.sourceReleaseId))
      .innerJoin(d, eq(d.id, s.datasetId))
      .innerJoin(publishers, eq(d.publisherId, publishers.id))
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

export const getApiAudit = query(
  z.object({ familyType: z.string(), releaseCode: z.string() }),
  async input => {
    const {
      releaseProvenance: p,
      metaReleases: r,
      metaSnapshotSources: sources,
      metaApiReleaseSetSnapshots: members,
      metaApiReleaseSets: sets,
      metaApiVersions: versions,
      metaSourceReleases: sourceReleases,
      metaDatasets: datasets,
      metaPublishers: publishers,
      metaPublisherI18n: publisherI18n,
    } = metaSchema
    const rows = await getMetaDb()
      .select({
        releaseId: r.id,
        code: r.code,
        resourceType: r.resourceType,
        apiReleaseSetRole: sql<string>`coalesce((select ${members.role} from ${sources} inner join ${members} on ${members.snapshotId} = ${sources.snapshotId} inner join ${sets} on ${sets.id} = ${members.apiReleaseSetId} inner join ${versions} on ${versions.id} = ${sets.apiVersionId} where ${sources.resourceReleaseId} = ${r.id} and ${sources.role} <> 'lookup' and ${versions.familyType} = ${input.familyType} and ${sets.code} = ${input.releaseCode} limit 1), 'supporting')`,
        sourcePublisherName: sql<string>`coalesce((select ${publisherI18n.name} from ${publisherI18n} where ${publisherI18n.publisherId} = ${publishers.id} and ${publisherI18n.locale} = 'en' limit 1), ${publishers.code})`,
        sourcePublisherShortName: sql<string>`coalesce((select ${publisherI18n.nameShort} from ${publisherI18n} where ${publisherI18n.publisherId} = ${publishers.id} and ${publisherI18n.locale} = 'en' limit 1), (select ${publisherI18n.name} from ${publisherI18n} where ${publisherI18n.publisherId} = ${publishers.id} and ${publisherI18n.locale} = 'en' limit 1), ${publishers.code})`,
        sourceSubType: datasets.subType,
        sourceVariant: datasets.sourceVariant,
        hash: p.manifestHash,
        byteLength: p.byteLength,
      })
      .from(p)
      .innerJoin(r, eq(p.releaseId, r.id))
      .innerJoin(sourceReleases, eq(r.sourceReleaseId, sourceReleases.id))
      .innerJoin(datasets, eq(sourceReleases.datasetId, datasets.id))
      .innerJoin(publishers, eq(datasets.publisherId, publishers.id))
      .where(sql`exists (
    select 1 from ${sources}
    inner join ${members} on ${members.snapshotId} = ${sources.snapshotId}
    inner join ${sets} on ${sets.id} = ${members.apiReleaseSetId}
    inner join ${versions} on ${versions.id} = ${sets.apiVersionId}
    where ${sources.resourceReleaseId} = ${r.id} and ${sources.role} <> 'lookup' and ${versions.familyType} = ${input.familyType} and ${sets.code} = ${input.releaseCode}
  )`)
      .all()
    return (
      await Promise.all(
        rows
          .sort(
            (left, right) =>
              Number(left.apiReleaseSetRole !== 'primary') -
              Number(right.apiReleaseSetRole !== 'primary'),
          )
          .map(async row => {
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

export const getAuditPage = query(
  z.object({
    releaseId: z.string(),
    hash: z.string(),
    q: z.string().max(300).default(''),
    offset: z.number().int().min(0).default(0),
    category: z.enum(['translations', 'patches', 'curations', 'rules']).optional(),
    fixtureIndex: z.number().int().min(0).optional(),
    entryIndex: z.number().int().min(0).optional(),
  }),
  async input => {
    const { manifest } = await manifestFor(input.releaseId, input.hash)
    const fixture =
      input.fixtureIndex === undefined
        ? undefined
        : manifest.individualFixtures?.[input.fixtureIndex]
    if (
      input.fixtureIndex !== undefined &&
      (!fixture || input.entryIndex === undefined)
    )
      throw new Error('Translation fixture is not declared by this release.')
    return readAuditPage(store(), manifest, input.q, input.offset, 50, {
      category: input.category,
      fixture: fixture
        ? { hash: fixture.object.hash, pointer: `/entries/${input.entryIndex}` }
        : undefined,
    })
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
    const fixture =
      input.bulkId === 'individual-fixtures'
        ? manifest.individualFixtures?.[input.index]
        : manifest.bulk.find(b => b.id === input.bulkId)?.fixtures[input.index]
    if (!fixture) throw new Error('Fixture is not declared by this release.')
    return readObject(store(), fixture.object)
  },
)

export const getRetainedRuleDeclaration = query(
  z.object({ releaseId: z.string(), hash: z.string(), bulkId: z.string() }),
  async input => {
    const { manifest } = await manifestFor(input.releaseId, input.hash)
    const bulk = manifest.bulk.find(b => b.id === input.bulkId)
    if (!bulk) throw new Error('Rule is not declared by this release.')
    return readObject(store(), bulk.definition)
  },
)

export const getAuditDecision = query(
  z.object({ releaseId: z.string(), hash: z.string(), actionId: z.string().max(2048) }),
  async input => {
    const { manifest } = await manifestFor(input.releaseId, input.hash)
    return readAuditDecision(store(), manifest, input.actionId)
  },
)
