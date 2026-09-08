import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  readObject,
  validateAuditManifest,
  type ObjectRef,
  type AuditManifest,
} from '@repo/core/provenance'
import { LocalPipelineBucket } from '../localPipeline/localBucket'
import {
  writeDeliveryFile,
  sha256,
  withDeliveryLock,
} from '../localPipeline/sqlDeliveryFiles'
import { deliverProcessingResult } from './provenance'
import type { UploadTarget } from '../cli/options'

/** Once completed, delivery retries transfer the exact retained graph. */
export async function deliverProducerAudit(input: {
  target: UploadTarget
  directory: string
  identity: string
  allowFailed?: boolean
  retain: (
    store: LocalPipelineBucket,
  ) => Promise<{ ref: ObjectRef; manifest: AuditManifest }>
}) {
  return withDeliveryLock(resolve(input.directory, 'audit.lock'), () =>
    deliverProducerAuditLocked({ ...input, identity: sha256(input.identity) }),
  )
}

async function deliverProducerAuditLocked(
  input: Parameters<typeof deliverProducerAudit>[0],
) {
  const store = new LocalPipelineBucket(input.directory)
  let retained: { identity: string; ref: ObjectRef } | undefined
  try {
    retained = JSON.parse(
      await readFile(resolve(input.directory, 'audit.json'), 'utf8'),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (retained) {
    const manifest = await readObject(store, retained.ref)
    validateAuditManifest(manifest)
    if (manifest.attempt.status === 'completed') {
      if (retained.identity !== input.identity)
        throw new Error(
          'Processing inputs differ from the retained audit. Resume the exact retained preparation.',
        )
      await deliverProcessingResult(input.target, store, retained.ref)
      return
    }
  }
  const result = await input.retain(store)
  await writeDeliveryFile(
    input.directory,
    'audit.json',
    JSON.stringify({ identity: input.identity, ref: result.ref }),
  )
  await deliverProcessingResult(input.target, store, result.ref)
  if (result.manifest.attempt.status === 'failed' && !input.allowFailed)
    throw new Error('Publication is blocked by the retained processing audit.')
}
