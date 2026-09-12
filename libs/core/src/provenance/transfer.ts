import {
  applicationReferences,
  readApplications,
  verifyProcessingResult,
} from './bundle'
import { cachedProvenanceStore } from './cache'
import { readObject } from './objects'
import { transferObjects } from './transferObjects'
import { validateManifest } from './validation'
import type { ObjectRef, ProvenanceStore } from './types'
import { transferAuditResult, validateAuditManifest } from './audit'

/** Transfer a verified graph, root last. It is not published until registered. */
export async function transferProcessingResult(
  source: ProvenanceStore,
  destination: ProvenanceStore,
  ref: ObjectRef,
  options: { concurrency?: number } = {},
) {
  source = cachedProvenanceStore(source)
  const manifest = await readObject(source, ref)
  if (
    manifest &&
    typeof manifest === 'object' &&
    !Array.isArray(manifest) &&
    manifest.kind === 'processing-audit'
  ) {
    validateAuditManifest(manifest)
    return transferAuditResult(source, destination, ref, manifest, options)
  }
  validateManifest(manifest)
  await verifyProcessingResult(source, manifest)
  const dependencies: ObjectRef[] = []
  for await (const application of readApplications(source, manifest))
    dependencies.push(...applicationReferences(application))
  dependencies.push(...manifest.chunks)
  await transferObjects(source, destination, dependencies, options.concurrency ?? 1)
  await transferObjects(source, destination, [ref], 1)
  return manifest
}
