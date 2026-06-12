import { defineConfig } from 'drizzle-kit'

const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_DATABASE_ID,
  CLOUDFLARE_D1_TOKEN,
  LOCAL_D1_SQLITE_PATH,
} = process.env

export default defineConfig({
  dialect: 'sqlite',
  ...(LOCAL_D1_SQLITE_PATH
    ? {
        dbCredentials: {
          url: LOCAL_D1_SQLITE_PATH,
        },
      }
    : {
        driver: 'd1-http' as const,
        dbCredentials: {
          accountId: CLOUDFLARE_ACCOUNT_ID ?? '',
          databaseId: CLOUDFLARE_DATABASE_ID ?? '',
          token: CLOUDFLARE_D1_TOKEN ?? '',
        },
      }),
  schema: '../../libs/db/src/schema/index.ts',
  out: '../../libs/db/migrations',
  verbose: true,
  strict: true,
})
