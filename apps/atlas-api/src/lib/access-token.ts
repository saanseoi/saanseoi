import { createAccessToken, verifyAccessToken } from '@repo/auth'
import type { TokenAudience } from '@repo/auth'

const TOKEN_TTL_SECONDS = 15 * 60

export const issueAccessToken = (
  env: Pick<CloudflareBindings, 'ACCESS_TOKEN_PRIVATE_JWK' | 'ENVIRONMENT'>,
  audience: TokenAudience,
  apiKeyId: string,
) => {
  const now = Math.floor(Date.now() / 1000)
  return createAccessToken(
    {
      aud: audience,
      env: env.ENVIRONMENT,
      exp: now + TOKEN_TTL_SECONDS,
      iat: now,
      sub: apiKeyId,
    },
    env.ACCESS_TOKEN_PRIVATE_JWK,
  )
}

export const authenticateAccessToken = (
  authorization: string | undefined,
  env: Pick<CloudflareBindings, 'ACCESS_TOKEN_PUBLIC_JWK' | 'ENVIRONMENT'>,
  audience: TokenAudience,
) => {
  const match = authorization?.match(/^Bearer (.+)$/i)
  if (!match?.[1]) return Promise.resolve(null)
  return verifyAccessToken(
    match[1],
    env.ACCESS_TOKEN_PUBLIC_JWK,
    audience,
    env.ENVIRONMENT,
  )
}
