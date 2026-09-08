import {
  applicationReferences,
  readApplications,
  verifyProcessingResult,
} from './bundle'
import { cachedProvenanceStore } from './cache'
import { readObject, retainObject } from './objects'
import { validateManifest } from './validation'
import type { ObjectRef, ProvenanceStore } from './types'

/** Transfer a verified graph, root last. It is not published until registered. */
export async function transferProcessingResult(
  source: ProvenanceStore,
  destination: ProvenanceStore,
  ref: ObjectRef,
) {
  source = cachedProvenanceStore(source)
  const manifest = await readObject(source, ref)
  validateManifest(manifest)
  await verifyProcessingResult(source, manifest)
  const copied = new Set<string>()
  async function copy(object: ObjectRef) {
    if (copied.has(object.hash)) return
    const retained = await retainObject(destination, await readObject(source, object))
    if (retained.hash !== object.hash || retained.byteLength !== object.byteLength)
      throw new Error('Transferred provenance reference mismatch.')
    copied.add(object.hash)
  }
  for await (const application of readApplications(source, manifest))
    for (const dependency of applicationReferences(application)) await copy(dependency)
  for (const chunk of manifest.chunks) await copy(chunk)
  await copy(ref)
  return manifest
}
