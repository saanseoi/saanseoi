import type { DatasetProcessingMessage } from '@repo/core'
import type { SaanseoiWorkerBindings } from '@repo/db'

export type AppEnv = {
  Bindings: SaanseoiWorkerBindings & {
    DATASET_QUEUE: Queue<DatasetProcessingMessage>
    DATA_SHARD_ENV: 'preview' | 'production'
    D1_PLACEMENT_PROBE_API_KEY: string
    HARBOUR_API_KEY: string
    HARBOUR_BASE_URL: string
    R2_ACCOUNT_ID: string
    R2_RAW: R2Bucket
    R2_RAW_ACCESS_KEY_ID: string
    R2_RAW_BUCKET_NAME: string
    R2_RAW_SECRET_ACCESS_KEY: string
    TELEGRAM_ADMIN_ID: string
    TELEGRAM_BOT_TOKEN: string
  }
}
