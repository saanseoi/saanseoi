import { defineConfig } from 'drizzle-kit'

import { createDrizzleConfig } from './drizzle.config.shared'

const drizzleDbYear = process.env.DRIZZLE_DB_YEAR ?? String(new Date().getFullYear())

export default defineConfig(
  createDrizzleConfig({
    localPathEnv: `LOCAL_D1_SQLITE_PATH_SOURCE_HK_${drizzleDbYear}`,
    remoteDatabaseIdEnv: `CLOUDFLARE_DATABASE_ID_SOURCE_HK_${drizzleDbYear}`,
    schema: './src/schema/source/index.ts',
    out: './migrations/source',
  }),
)
