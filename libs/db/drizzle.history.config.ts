import { defineConfig } from 'drizzle-kit'

import { createDrizzleConfig } from './drizzle.config.shared'

export default defineConfig(
  createDrizzleConfig({
    localPathEnv: 'LOCAL_D1_SQLITE_PATH_HISTORY_HK_2026',
    remoteDatabaseIdEnv: 'CLOUDFLARE_DATABASE_ID_HISTORY_HK_2026',
    schema: './src/schema/history/index.ts',
    out: './migrations/history',
  }),
)
