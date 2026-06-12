import { defineConfig } from 'drizzle-kit'

import { createDrizzleConfig } from './drizzle.config.shared'

export default defineConfig(
  createDrizzleConfig({
    localPathEnv: 'LOCAL_D1_SQLITE_PATH_CURRENT',
    remoteDatabaseIdEnv: 'CLOUDFLARE_DATABASE_ID_CURRENT',
    schema: './src/schema/api-current/index.ts',
    out: './migrations/current',
  }),
)
