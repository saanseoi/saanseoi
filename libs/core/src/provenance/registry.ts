import { and, eq, inArray, metaSchema, sql } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '../lib/db/types'
import { readObject } from './objects'
import { verifyProcessingResult } from './bundle'
import { validateManifest } from './validation'
import type { ObjectRef, ProvenanceStore } from './types'
import { validateAuditManifest, verifyAuditResult } from './audit'

/** Verify new R2 closures first; identical registered manifests are idempotent. */
export async function registerProcessingResult(
  db: HarbourReadableDb & HarbourWritableDb,
  store: ProvenanceStore,
  releaseId: string,
  ref: ObjectRef,
) {
  const manifest = await readObject(store, ref)
  const audit =
    !!manifest &&
    typeof manifest === 'object' &&
    !Array.isArray(manifest) &&
    manifest.kind === 'processing-audit'
  if (audit) validateAuditManifest(manifest)
  else validateManifest(manifest)
  // Each format is verified using its own contract before registration.
  const result = manifest as
    | import('./types').ProcessingManifest
    | import('./auditTypes').AuditManifest
  if (result.releaseId !== releaseId) throw new Error('Provenance release mismatch.')
  const table = metaSchema.releaseProvenance
  const releases = metaSchema.metaReleases
  const release = await db
    .select({ status: releases.status, type: releases.resourceType })
    .from(releases)
    .where(eq(releases.id, releaseId))
    .get()
  if (!release) throw new Error('Unknown provenance release.')
  if (release.type === 'street')
    throw new Error('Streets provenance is outside this implementation.')
  if (
    result.kind === 'processing-result' &&
    result.collections.some(c => c.layer === 'canonical' && c.releaseId !== releaseId)
  )
    throw new Error('Canonical collection belongs to a different release.')
  const existing = await db
    .select()
    .from(table)
    .where(eq(table.releaseId, releaseId))
    .get()
  if (existing?.manifestHash === ref.hash && existing.byteLength === ref.byteLength)
    return existing
  if (result.kind === 'processing-audit') await verifyAuditResult(store, result)
  else await verifyProcessingResult(store, result)
  if (!['staged', 'processing'].includes(release.status))
    throw new Error('Published provenance is immutable.')
  // A release has one processing result. Multiple outputs are declared in its collections.
  await db
    .insert(table)
    .select(
      db
        .select({
          releaseId: releases.id,
          manifestHash: sql<string>`${ref.hash}`,
          byteLength: sql<number>`${ref.byteLength}`,
          applicationCount: sql<number>`${result.applicationCount}`,
        })
        .from(releases)
        .where(
          and(
            eq(releases.id, releaseId),
            inArray(releases.status, ['staged', 'processing']),
          ),
        ),
    )
    .onConflictDoUpdate({
      target: table.releaseId,
      set: {
        manifestHash: ref.hash,
        byteLength: ref.byteLength,
        applicationCount: result.applicationCount,
      },
    })
    .run()
  const saved = await db
    .select()
    .from(table)
    .where(eq(table.releaseId, releaseId))
    .get()
  if (saved?.manifestHash !== ref.hash || saved.byteLength !== ref.byteLength)
    throw new Error('Release changed while registering provenance.')
  return saved
}
