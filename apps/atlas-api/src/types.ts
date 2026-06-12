import type { createDb, SaanseoiWorkerBindings } from '@repo/db'

export type AppBindings = CloudflareBindings &
  SaanseoiWorkerBindings & {
    SUBSTACK_SESSION_COOKIE: string
    TELEGRAM_ADMIN_ID: string
    TELEGRAM_BOT_TOKEN: string
  }

export type AppEnv = {
  Bindings: AppBindings
  Variables: {
    db: ReturnType<typeof createDb>
  }
}
