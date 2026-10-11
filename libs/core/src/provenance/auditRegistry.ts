import { and, eq, metaSchema, sql } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '../lib/db/types'
import type { AuditManifest } from './auditTypes'
import type { ObjectRef, ProvenanceStore } from './types'
import { verifyAuditResult } from './audit'

type Db = HarbourReadableDb & HarbourWritableDb

/** Validate the declared output and its retained source membership before binding evidence. */
export async function registerAuditResult(
  db: Db,
  store: ProvenanceStore,
  manifest: AuditManifest,
  ref: ObjectRef,
) {
  const { stage, ownerId } = manifest.scope
  const { resourceReleaseId } = manifest
  const table = metaSchema.processingAudits
  const key = and(
    eq(table.resourceReleaseId, resourceReleaseId),
    eq(table.stage, stage),
    eq(table.ownerId, ownerId),
  )
  const existing = await db.select().from(table).where(key).get()
  if (existing?.manifestHash === ref.hash && existing.byteLength === ref.byteLength)
    return existing
  await verifyAuditResult(store, manifest)
  const releases = metaSchema.metaResourceReleases
  const sources = metaSchema.metaSnapshotResourceReleases
  const snapshots = metaSchema.metaSnapshots
  const sets = metaSchema.metaApiReleaseSets
  const members = metaSchema.metaApiReleaseSetSnapshots
  const versions = metaSchema.metaApiVersionReleaseSets
  let mutable: ReturnType<typeof sql>
  if (stage === 'preparation' || stage === 'ingestion') {
    if (ownerId !== resourceReleaseId)
      throw Error('Source audit owner must be its resource release.')
    mutable = sql`exists (select 1 from ${releases} where ${releases.id} = ${resourceReleaseId} and ${releases.status} in ('uploading', 'staged', 'processing'))`
  } else if (stage === 'assembly') {
    mutable = sql`exists (select 1 from ${snapshots} join ${sources} on ${sources.snapshotId} = ${snapshots.id} where ${snapshots.id} = ${ownerId} and ${snapshots.status} = 'draft' and ${sources.resourceReleaseId} = ${resourceReleaseId})`
  } else {
    mutable = sql`exists (select 1 from ${sets} join ${members} on ${members.apiReleaseSetId} = ${sets.id} join ${sources} on ${sources.snapshotId} = ${members.snapshotId} where ${sets.id} = ${ownerId} and not exists (select 1 from ${versions} where ${versions.apiReleaseSetId} = ${sets.id} and ${versions.status} <> 'draft') and ${sources.resourceReleaseId} = ${resourceReleaseId})`
  }
  await db
    .insert(table)
    .select(
      db
        .select({
          resourceReleaseId: releases.id,
          stage: sql<AuditManifest['scope']['stage']>`${stage}`,
          ownerId: sql<string>`${ownerId}`,
          manifestHash: sql<string>`${ref.hash}`,
          byteLength: sql<number>`${ref.byteLength}`,
          applicationCount: sql<number>`${manifest.applicationCount}`,
          attemptStatus: sql<'completed' | 'failed'>`${manifest.attempt.status}`,
        })
        .from(releases)
        .where(and(eq(releases.id, resourceReleaseId), mutable)),
    )
    .onConflictDoUpdate({
      target: [table.resourceReleaseId, table.stage, table.ownerId],
      set: {
        manifestHash: ref.hash,
        byteLength: ref.byteLength,
        applicationCount: manifest.applicationCount,
        attemptStatus: manifest.attempt.status,
      },
      setWhere: mutable,
    })
    .run()
  const saved = await db.select().from(table).where(key).get()
  if (saved?.manifestHash !== ref.hash || saved.byteLength !== ref.byteLength)
    throw Error(
      'Audit output is unknown, unrelated, published, or changed during registration.',
    )
  return saved
}
