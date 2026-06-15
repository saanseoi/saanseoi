import { defineConfig } from 'drizzle-kit'

import { createDrizzleConfig } from './drizzle.config.shared'

export default defineConfig(
  createDrizzleConfig({
    localPathEnv: 'LOCAL_D1_SQLITE_PATH_META',
    remoteDatabaseIdEnv: 'CLOUDFLARE_DATABASE_ID_META',
    schema: './src/schema/meta/index.ts',
    out: './migrations/meta',
  }),
)
