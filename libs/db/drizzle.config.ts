import { defineConfig } from 'drizzle-kit'

const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_DATABASE_ID,
  CLOUDFLARE_D1_TOKEN,
  LOCAL_D1_SQLITE_PATH,
} = process.env

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
          databaseId: CLOUDFLARE_DATABASE_ID ?? '',
          token: CLOUDFLARE_D1_TOKEN ?? '',
        },
        schema: './src/schema/index.ts',
        out: './migrations',
        strict: true,
        verbose: true,
      },
)
