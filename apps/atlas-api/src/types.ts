import type {
  createCurrentDb,
  createHistoryDb,
  createMetaDb,
  SaanseoiWorkerBindings,
} from '@repo/db'
import type { AuthenticatedApiKey } from './lib/api-key-auth'

export type AppBindings = CloudflareBindings &
  SaanseoiWorkerBindings & {
    D1_PLACEMENT_PROBE_API_KEY: string
    R2_ASSETS: R2Bucket
    SUBSTACK_SESSION_COOKIE: string
    TELEGRAM_ADMIN_ID: string
    TELEGRAM_BOT_TOKEN: string
  }

export type AppEnv = {
  Bindings: AppBindings
  Variables: {
    currentDb: ReturnType<typeof createCurrentDb>
    historyDbs: ReturnType<typeof createHistoryDb>[]
    metaDb: ReturnType<typeof createMetaDb>
    apiKey: AuthenticatedApiKey
  }
}
