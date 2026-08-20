/**
 * The privacy-minimised product-usage event contract shared by Atlas workers.
 *
 * This is deliberately independent from API-key billing/usage accounting.
 */
export const PRODUCT_USAGE_SCHEMA_VERSION = 'v1' as const

export const PRODUCT_USAGE_EVENTS = [
  'api.request',
  'api.access',
  'api.asset_download',
  'api.style_request',
  'newsletter.subscription',
  'registry.data_load',
  'auth.outcome',
  'account.mutation',
  'api_key.create',
  'api_key.revoke',
  'api_key.reveal',
  'api_key.copy',
  'client.download_click',
  'client.release_tab_view',
  'client.release_notes_diff',
  'client.audit_control',
  'client.copy_request',
  'client.copy_evidence_json',
  'client.evidence_fullscreen',
  'client.sample_control',
  'client.source_search',
  'client.source_flow_expand',
  'client.basemap_control',
  'client.style_link',
  'client.viewer_link',
  'guide.milestone',
  'guide.handover',
  'guide.prompt_copy',
  'guide.provider_open',
  'guide.share',
  'guide.completion',
  'client.fallback',
] as const

export type ProductUsageEventName = (typeof PRODUCT_USAGE_EVENTS)[number]

export const PRODUCT_USAGE_PRODUCERS = [
  'atlas-api',
  'atlas-app',
  'atlas-client',
] as const
export type ProductUsageProducer = (typeof PRODUCT_USAGE_PRODUCERS)[number]

export const PRODUCT_USAGE_SURFACES = [
  'api',
  'asset_request',
  'style_request',
  'newsletter',
  'registry',
  'auth',
  'account',
  'api_keys',
  'access',
  'api_release',
  'source_release',
  'sources',
  'basemaps',
  'guide',
] as const
export type ProductUsageSurface = (typeof PRODUCT_USAGE_SURFACES)[number]

export const PRODUCT_USAGE_ENTITY_TYPES = [
  'asset',
  'style',
  'source',
  'dataset',
  'source_release',
  'api',
  'api_release',
  'api_release_set',
  'publisher',
  'data_release',
  'district',
  'sample',
  'region',
  'theme',
  'provider',
  'tab',
  'guide',
  'action',
  'account_mutation',
  'auth_method',
  'key_action',
] as const
export type ProductUsageEntityType = (typeof PRODUCT_USAGE_ENTITY_TYPES)[number]

export const PRODUCT_USAGE_OUTCOMES = [
  'success',
  'failure',
  'pending',
  'cancelled',
  'unavailable',
] as const
export type ProductUsageOutcome = (typeof PRODUCT_USAGE_OUTCOMES)[number]

export type ProductUsageEventInput = {
  event: ProductUsageEventName
  producer: ProductUsageProducer
  surface: ProductUsageSurface
  route: string
  entityType?: ProductUsageEntityType
  entityId?: string
  entityId2?: string
  outcome: ProductUsageOutcome
  httpStatus?: number
  durationMs?: number
  count?: number
  metricKey?: string
}

export type ProductUsageDataset = {
  writeDataPoint: (point: ProductUsageDataPoint) => void
}

export type ProductUsageDataPoint = {
  indexes: string[]
  blobs: string[]
  doubles?: number[]
}

const PUBLIC_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
const SAFE_ROUTE = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{0,199}$/
const SECRET_LIKE_IDENTIFIER =
  /^(?:bearer|token|secret|sk|pk|api[_-]?key)[_:-]|^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i

const isOneOf = <T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] => values.includes(value)

export function isProductUsageEventName(value: string): value is ProductUsageEventName {
  return isOneOf(PRODUCT_USAGE_EVENTS, value)
}

export function isClientProductUsageEventName(
  value: string,
): value is ProductUsageEventName {
  return (
    isProductUsageEventName(value) &&
    (value.startsWith('client.') ||
      value.startsWith('guide.') ||
      value === 'api_key.reveal' ||
      value === 'api_key.copy')
  )
}

export function normaliseProductUsageRoute(value: string): string {
  let pathname = value
  try {
    pathname = new URL(value, 'https://saanseoi.invalid').pathname
  } catch {
    pathname = value.split(/[?#]/, 1)[0] ?? '/'
  }
  pathname = `/${pathname.replace(/^\/+/, '').replaceAll(/\/{2,}/g, '/')}`
  pathname = pathname.replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
  pathname = pathname.replaceAll(/\/\d+(?=\/|$)/g, '/:id')
  return SAFE_ROUTE.test(pathname) ? pathname : '/'
}

function safeIdentifier(value: string | undefined): string {
  return value && PUBLIC_IDENTIFIER.test(value) && !SECRET_LIKE_IDENTIFIER.test(value)
    ? value
    : ''
}

function safeNumber(value: number | undefined, minimum: number, maximum: number) {
  return value !== undefined && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : undefined
}

export function toProductUsageDataPoint(
  input: ProductUsageEventInput,
): ProductUsageDataPoint | null {
  if (
    !isProductUsageEventName(input.event) ||
    !isOneOf(PRODUCT_USAGE_PRODUCERS, input.producer) ||
    !isOneOf(PRODUCT_USAGE_SURFACES, input.surface) ||
    !isOneOf(PRODUCT_USAGE_OUTCOMES, input.outcome) ||
    (input.entityType !== undefined &&
      !isOneOf(PRODUCT_USAGE_ENTITY_TYPES, input.entityType))
  )
    return null

  const entityId = safeIdentifier(input.entityId)
  const entityId2 = safeIdentifier(input.entityId2)
  const httpStatus = safeNumber(input.httpStatus, 100, 599)
  const durationMs = safeNumber(input.durationMs, 0, 600_000)
  const count = safeNumber(input.count, 0, 1_000_000)
  const metricKey = safeIdentifier(input.metricKey)

  const blobs = [
    PRODUCT_USAGE_SCHEMA_VERSION,
    input.event,
    input.producer,
    input.surface,
    normaliseProductUsageRoute(input.route),
    input.entityType ?? '',
    entityId,
    entityId2,
    input.outcome,
    httpStatus === undefined ? '' : String(Math.round(httpStatus)),
  ]

  if (input.event === 'api.access') blobs.push(metricKey)

  return {
    indexes: [input.event],
    blobs,
    doubles: [durationMs ?? 0, count ?? 1],
  }
}

export function recordProductUsage(
  dataset: ProductUsageDataset | undefined | null,
  input: ProductUsageEventInput,
): void {
  if (!dataset) return
  const point = toProductUsageDataPoint(input)
  if (!point) return
  try {
    dataset.writeDataPoint(point)
  } catch {
    // Product analytics is deliberately fail-open and must never affect a request.
  }
}
