import { createCurrentDb, createMetaDb, type MultiDbBindings } from '@repo/db'
import type { SnapshotCleanupMessage } from '@repo/core'

import { withPrimarySession } from './lib/d1'
import { cleanupCurrentSnapshots } from './lib/services/snapshotCleanup'

type Env = Partial<MultiDbBindings>

export function createQueueHandler() {
  return async (batch: MessageBatch<SnapshotCleanupMessage>, env: Env) => {
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
      try {
        await cleanupCurrentSnapshots(metaDb, currentDb, message.body)
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

export default {
  queue: createQueueHandler(),
}
