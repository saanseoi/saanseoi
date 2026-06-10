import type { DatasetProcessingMessage } from '@repo/core'

export type AppEnv = {
  Bindings: {
    DATASET_QUEUE: Queue<DatasetProcessingMessage>
    DB: D1Database
    HARBOUR_API_KEY: string
    R2_ACCOUNT_ID: string
    R2_RAW: R2Bucket
    R2_RAW_ACCESS_KEY_ID: string
    R2_RAW_BUCKET_NAME: string
    R2_RAW_SECRET_ACCESS_KEY: string
    TELEGRAM_ADMIN_ID: string
    TELEGRAM_BOT_TOKEN: string
  }
}
