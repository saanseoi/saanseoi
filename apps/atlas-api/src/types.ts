import type { createDb } from '@repo/db'

export type AppEnv = {
  Bindings: CloudflareBindings
  Variables: {
    db: ReturnType<typeof createDb>
  }
}
