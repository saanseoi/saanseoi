import { registerAuditResult } from './auditRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '../lib/db/types'
import { readObject } from './objects'
import type { ObjectRef, ProvenanceStore } from './types'
import { validateAuditManifest } from './audit'

/** Verify and register an audit for its exact lifecycle owner. */
export async function registerProcessingResult(
  db: HarbourReadableDb & HarbourWritableDb,
  store: ProvenanceStore,
  resourceReleaseId: string,
  ref: ObjectRef,
) {
  const manifest = await readObject(store, ref)
  validateAuditManifest(manifest)
  if (manifest.resourceReleaseId !== resourceReleaseId)
    throw new Error('Provenance release mismatch.')
  return registerAuditResult(db, store, manifest, ref)
}
