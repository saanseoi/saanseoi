import { createCurrentDb, createMetaDb, type MultiDbBindings } from '@repo/db'
import type { HarbourJobMessage, SnapshotCleanupMessage } from '@repo/core'

import { withPrimarySession } from './lib/d1'
import { cleanupCurrentSnapshots } from './lib/services/snapshotCleanup'

type Env = Partial<MultiDbBindings>

export function createQueueHandler() {
  return async (batch: MessageBatch<HarbourJobMessage>, env: Env) => {
    const currentBinding = env.DB_CURRENT
    const metaBinding = env.DB_META

    if (!currentBinding) {
      throw new Error('Missing DB_CURRENT binding for harbour-workers.')
    }
    if (!metaBinding) {
      throw new Error('Missing DB_META binding for harbour-workers.')
    }

    const metaDb = createMetaDb(withPrimarySession(metaBinding))
    const currentDb = createCurrentDb(withPrimarySession(currentBinding))

    for (const message of batch.messages) {
      const body = message.body

      if (!isSnapshotCleanupMessage(body)) {
        console.warn(
          JSON.stringify({
            jobType: readStringProperty(body, 'jobType') ?? 'processDataset',
            messageId: message.id,
            phase: 'harbourWorkerQueue',
            reason: 'uploadProcessingRemoved',
            releaseCode: readStringProperty(body, 'releaseCode'),
            releaseId: readStringProperty(body, 'releaseId'),
            status: 'ackedUnsupported',
          }),
        )
        message.ack()
        continue
      }

      try {
        await cleanupCurrentSnapshots(metaDb, currentDb, body)
        message.ack()
      } catch (error) {
        console.error(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            messageId: message.id,
            phase: 'cleanupCurrentSnapshots',
            status: 'failed',
          }),
        )
        throw error
      }
    }
  }
}

function isSnapshotCleanupMessage(
  message: HarbourJobMessage,
): message is SnapshotCleanupMessage {
  return message.jobType === 'cleanupCurrentSnapshots'
}

function readStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const property = (value as Record<string, unknown>)[key]

  return typeof property === 'string' ? property : undefined
}

export default {
  queue: createQueueHandler(),
}
