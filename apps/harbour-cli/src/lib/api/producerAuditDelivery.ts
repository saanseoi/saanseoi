import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  readObject,
  validateAuditManifest,
  type ObjectRef,
  type AuditManifest,
} from '@repo/core/provenance'
import { LocalPipelineBucket } from '../pipeline/local/localBucket'
import {
  writeDeliveryFile,
  sha256,
  withDeliveryLock,
} from '../pipeline/local/sqlDeliveryFiles'
import { deliverProcessingResult } from './provenance'
import type { UploadTarget } from '../cli/options'

/** Once completed, delivery retries transfer the exact retained graph. */
export async function deliverProducerAudit(input: {
  target: UploadTarget
  directory: string
  identity: string
  allowFailed?: boolean
  onProgress?: (message: string) => void
  retain: (store: LocalPipelineBucket) => Promise<{
    ref: ObjectRef
    manifest: AuditManifest
    additional?: Array<{ ref: ObjectRef; manifest: AuditManifest }>
  }>
}) {
  return withDeliveryLock(resolve(input.directory, 'audit.lock'), () =>
    deliverProducerAuditLocked({ ...input, identity: sha256(input.identity) }),
  )
}

async function deliverProducerAuditLocked(
  input: Parameters<typeof deliverProducerAudit>[0],
) {
  const store = new LocalPipelineBucket(input.directory)
  let retained: { identity: string; refs: ObjectRef[] } | undefined
  try {
    retained = JSON.parse(
      await readFile(resolve(input.directory, 'stage-audits.json'), 'utf8'),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (retained) {
    const manifests: AuditManifest[] = []
    for (const ref of retained.refs) {
      const manifest = await readObject(store, ref)
      validateAuditManifest(manifest)
      manifests.push(manifest)
    }
    if (
      manifests.length &&
      manifests.every(manifest => manifest.attempt.status === 'completed')
    ) {
      if (retained.identity !== input.identity)
        throw new Error(
          'Processing inputs differ from the audit. Resume the exact retained preparation.',
        )
      for (const ref of retained.refs)
        await deliverProcessingResult(input.target, store, ref, input.onProgress)
      return
    }
  }
  const result = await input.retain(store)
  const results = [result, ...(result.additional ?? [])]
  await writeDeliveryFile(
    input.directory,
    'stage-audits.json',
    JSON.stringify({
      identity: input.identity,
      refs: results.map(result => result.ref),
    }),
  )
  for (const result of results)
    await deliverProcessingResult(input.target, store, result.ref, input.onProgress)
  if (
    results.some(result => result.manifest.attempt.status === 'failed') &&
    !input.allowFailed
  )
    throw new Error('Publication is blocked by the retained processing audit.')
}
