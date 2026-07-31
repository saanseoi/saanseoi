import type {
  createCurrentDb,
  createHistoryDb,
  createMetaDb,
  SaanseoiWorkerBindings,
} from '@repo/db'
import type { AuthenticatedApiKey } from './lib/api-key-auth'

export type AppBindings = CloudflareBindings &
  SaanseoiWorkerBindings & {
    ACCESS_TOKEN_PRIVATE_JWK: string
    ACCESS_TOKEN_PUBLIC_JWK: string
    API_RATE_LIMIT: RateLimit
    API_USAGE: AnalyticsEngineDataset
    AUTH_MODE: 'disabled' | 'required'
    D1_PLACEMENT_PROBE_API_KEY: string
    R2_ASSETS: R2Bucket
    ENVIRONMENT: string
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
