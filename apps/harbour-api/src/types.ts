import type { HarbourJobMessage } from '@repo/core'
import type { SaanseoiWorkerBindings } from '@repo/db'

export type AppEnv = {
  Bindings: SaanseoiWorkerBindings & {
    DATASET_QUEUE: Queue<HarbourJobMessage>
    DATA_SHARD_ENV: 'preview' | 'production'
    D1_PLACEMENT_PROBE_API_KEY: string
    ATLAS_BASE_URL: string
    AZURE_TRANSLATION_KEY: string
    DISCORD_BOT_TOKEN?: string
    DISCORD_RELEASES_CHANNEL_ID?: string
    HARBOUR_API_KEY: string
    HARBOUR_BASE_URL: string
    R2_ASSETS: R2Bucket
    TELEGRAM_ADMIN_ID: string
    TELEGRAM_BOT_TOKEN: string
  }
}
