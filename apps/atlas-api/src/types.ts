import type { createDb } from '@repo/db'

export type AppBindings = CloudflareBindings & {
  SUBSTACK_SESSION_COOKIE: string
}

export type AppEnv = {
  Bindings: AppBindings
  Variables: {
    db: ReturnType<typeof createDb>
  }
}
