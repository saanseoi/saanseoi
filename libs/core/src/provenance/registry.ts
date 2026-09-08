import { and, eq, inArray, metaSchema, sql } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '../lib/db/types'
import { readObject } from './objects'
import { verifyProcessingResult } from './bundle'
import { validateManifest } from './validation'
import type { ObjectRef, ProvenanceStore } from './types'

/** Verify R2 first; the D1 statement guards release status at commit time. */
export async function registerProcessingResult(
  db: HarbourReadableDb & HarbourWritableDb,
  store: ProvenanceStore,
  releaseId: string,
  ref: ObjectRef,
) {
  const manifest = await readObject(store, ref)
  validateManifest(manifest)
  if (manifest.releaseId !== releaseId) throw new Error('Provenance release mismatch.')
  await verifyProcessingResult(store, manifest)
  const table = metaSchema.releaseProvenance
  const releases = metaSchema.metaReleases
  const release = await db
    .select({ status: releases.status, type: releases.type })
    .from(releases)
    .where(eq(releases.id, releaseId))
    .get()
  if (!release) throw new Error('Unknown provenance release.')
  if (release.type === 'street')
    throw new Error('Streets provenance is outside this implementation.')
  const existing = await db
    .select()
    .from(table)
    .where(eq(table.releaseId, releaseId))
    .get()
  if (existing?.manifestHash === ref.hash && existing.byteLength === ref.byteLength)
    return existing
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
          applicationCount: sql<number>`${manifest.applicationCount}`,
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
        applicationCount: manifest.applicationCount,
      },
    })
    .run()
  const saved = await db
    .select()
    .from(table)
    .where(eq(table.releaseId, releaseId))
    .get()
  if (saved?.manifestHash !== ref.hash)
    throw new Error('Release changed while registering provenance.')
  return saved
}
