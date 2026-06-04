import type { createDb } from '@repo/db'

export type AppEnv = {
  Bindings: Env
  Variables: {
    db: ReturnType<typeof createDb>
  }
}
