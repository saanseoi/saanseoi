import { defineConfig } from 'drizzle-kit'

const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_DATABASE_ID,
  CLOUDFLARE_DATABASE_ID_PREVIEW,
  CLOUDFLARE_DATABASE_ID_PRODUCTION,
  CLOUDFLARE_D1_TOKEN,
  CLOUDFLARE_D1_TARGET,
  LOCAL_D1_SQLITE_PATH,
} = process.env

const studioTarget =
  CLOUDFLARE_D1_TARGET === 'preview' || CLOUDFLARE_D1_TARGET === 'production'
    ? CLOUDFLARE_D1_TARGET
    : undefined

const remoteDatabaseId = studioTarget
  ? studioTarget === 'preview'
    ? (CLOUDFLARE_DATABASE_ID_PREVIEW ?? '')
    : (CLOUDFLARE_DATABASE_ID_PRODUCTION ?? '')
  : (CLOUDFLARE_DATABASE_ID ?? '')

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
          databaseId: remoteDatabaseId,
          token: CLOUDFLARE_D1_TOKEN ?? '',
        },
      }),
  schema: '../../libs/db/src/schema/index.ts',
  out: '../../libs/db/migrations',
  verbose: true,
  strict: true,
})
