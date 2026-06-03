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
    ? CLOUDFLARE_DATABASE_ID_PREVIEW ?? ''
    : CLOUDFLARE_DATABASE_ID_PRODUCTION ?? ''
  : CLOUDFLARE_DATABASE_ID ?? ''

export default defineConfig(
  LOCAL_D1_SQLITE_PATH
    ? {
        dialect: 'sqlite',
        dbCredentials: {
          url: LOCAL_D1_SQLITE_PATH,
        },
        schema: './src/schema/index.ts',
        out: './migrations',
        strict: true,
        verbose: true,
      }
    : {
        dialect: 'sqlite',
        driver: 'd1-http',
        dbCredentials: {
          accountId: CLOUDFLARE_ACCOUNT_ID ?? '',
          databaseId: remoteDatabaseId,
          token: CLOUDFLARE_D1_TOKEN ?? '',
        },
        schema: './src/schema/index.ts',
        out: './migrations',
        strict: true,
        verbose: true,
      },
)
