const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_D1_TOKEN,
  CLOUDFLARE_D1_TARGET,
  LOCAL_D1_SQLITE_PATH,
} = process.env

type DrizzleFamily = {
  localPathEnv: string
  out: string
  remoteDatabaseIdEnv: string
  schema: string
}

export function createDrizzleConfig(family: DrizzleFamily) {
  const localPath = process.env[family.localPathEnv] ?? LOCAL_D1_SQLITE_PATH
  const remoteDatabaseId = process.env[family.remoteDatabaseIdEnv] ?? ''
  const accountId = CLOUDFLARE_ACCOUNT_ID ?? ''
  const token = CLOUDFLARE_D1_TOKEN ?? ''

  if (localPath) {
    return {
      dialect: 'sqlite' as const,
      dbCredentials: {
        url: localPath,
      },
      schema: family.schema,
      out: family.out,
      strict: true,
      verbose: true,
    }
  }

  if (!remoteDatabaseId || !accountId || !token) {
    return {
      dialect: 'sqlite' as const,
      schema: family.schema,
      out: family.out,
      strict: true,
      verbose: true,
    }
  }

  return {
    dialect: 'sqlite' as const,
    driver: 'd1-http' as const,
    dbCredentials: {
      accountId,
      databaseId: remoteDatabaseId,
      token,
    },
    schema: family.schema,
    out: family.out,
    strict: true,
    verbose: true,
  }
}

export const drizzleTarget = CLOUDFLARE_D1_TARGET
