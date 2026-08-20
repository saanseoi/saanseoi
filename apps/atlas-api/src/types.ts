import type {
  createCurrentDb,
  createHistoryDb,
  createMetaDb,
  SaanseoiWorkerBindings,
} from '@repo/db'
import type { AccessAttribution } from './services/accessAnalytics'

export type AppBindings = CloudflareBindings &
  SaanseoiWorkerBindings & {
    API_RATE_LIMIT: RateLimit
    NEWSLETTER_RATE_LIMIT: RateLimit
    API_USAGE: AnalyticsEngineDataset
    PRODUCT_USAGE?: AnalyticsEngineDataset
    ANALYTICS_ENGINE_ACCOUNT_ID: string
    ANALYTICS_ENGINE_READ_TOKEN: string
    PRODUCT_USAGE_DATASET: string
    AUTH_MODE: 'disabled' | 'required'
    D1_PLACEMENT_PROBE_API_KEY: string
    R2_ASSETS: R2Bucket
    PUBLIC_KEY_LEASE_COORDINATOR: DurableObjectNamespace
    PUBLIC_KEY_LEASES: KVNamespace
    ENVIRONMENT: string
    SUBSTACK_SESSION_COOKIE: string
    TELEGRAM_ADMIN_ID: string
    TELEGRAM_BOT_TOKEN: string
    USAGE_ROLLUP_DATASETS: string
  }

export type AppEnv = {
  Bindings: AppBindings
  Variables: {
    currentDb: ReturnType<typeof createCurrentDb>
    historyDbs: ReturnType<typeof createHistoryDb>[]
    metaDb: ReturnType<typeof createMetaDb>
    accessAttribution?: AccessAttribution
  }
}
