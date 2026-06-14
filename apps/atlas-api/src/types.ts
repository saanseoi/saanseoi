import type { createCurrentDb, createMetaDb, SaanseoiWorkerBindings } from '@repo/db'

export type AppBindings = CloudflareBindings &
  SaanseoiWorkerBindings & {
    SUBSTACK_SESSION_COOKIE: string
    TELEGRAM_ADMIN_ID: string
    TELEGRAM_BOT_TOKEN: string
  }

export type AppEnv = {
  Bindings: AppBindings
  Variables: {
    currentDb: ReturnType<typeof createCurrentDb>
    metaDb: ReturnType<typeof createMetaDb>
  }
}
