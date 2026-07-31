import { verifyAccessToken } from '@repo/auth'
import { isUnmeteredOrigin } from './access'

export const authenticateTileRequest = async (
  request: Request,
  env: Pick<
    CloudflareBindings,
    | 'ACCESS_TOKEN_PUBLIC_JWK'
    | 'AUTH_MODE'
    | 'ENVIRONMENT'
    | 'CORE_ORIGIN_SUFFIXES'
    | 'DIAGNOSTIC_ORIGINS'
    | 'DEV_ORIGINS'
    | 'HUB_ORIGINS'
    | 'PREVIEW_PREFIXES'
  >,
) => {
  if (
    String(env.AUTH_MODE) === 'disabled' ||
    isUnmeteredOrigin(request.headers.get('Origin'), env)
  ) {
    return { unmetered: true as const }
  }
  const match = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)
  if (!match?.[1]) return null
  const claims = await verifyAccessToken(
    match[1],
    env.ACCESS_TOKEN_PUBLIC_JWK,
    'basemap-tiles',
    env.ENVIRONMENT,
  )
  return claims ? { unmetered: false as const, claims } : null
}
