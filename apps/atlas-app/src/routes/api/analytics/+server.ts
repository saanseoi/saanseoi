import { json, type RequestHandler } from '@sveltejs/kit'
import {
  isClientProductUsageEventName,
  PRODUCT_USAGE_ENTITY_TYPES,
  PRODUCT_USAGE_OUTCOMES,
  PRODUCT_USAGE_SURFACES,
  recordProductUsage,
  type ProductUsageEntityType,
  type ProductUsageOutcome,
  type ProductUsageSurface,
} from '@repo/core/productUsage'

type ClientPayload = {
  event?: unknown
  surface?: unknown
  route?: unknown
  entityType?: unknown
  entityId?: unknown
  entityId2?: unknown
  outcome?: unknown
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isAllowedValue = <T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] => isString(value) && values.includes(value)

export const POST: RequestHandler = async ({ request, platform }) => {
  let payload: ClientPayload
  try {
    payload = (await request.json()) as ClientPayload
  } catch {
    return json({ error: 'invalid_analytics_event' }, { status: 400 })
  }

  if (
    !isString(payload.event) ||
    !isClientProductUsageEventName(payload.event) ||
    !isAllowedValue(PRODUCT_USAGE_SURFACES, payload.surface) ||
    (payload.entityType !== undefined &&
      !isAllowedValue(PRODUCT_USAGE_ENTITY_TYPES, payload.entityType)) ||
    (payload.outcome !== undefined &&
      !isAllowedValue(PRODUCT_USAGE_OUTCOMES, payload.outcome)) ||
    (payload.route !== undefined && !isString(payload.route)) ||
    (payload.entityId !== undefined && !isString(payload.entityId)) ||
    (payload.entityId2 !== undefined && !isString(payload.entityId2))
  ) {
    return json({ error: 'invalid_analytics_event' }, { status: 400 })
  }

  recordProductUsage(platform?.env.PRODUCT_USAGE, {
    event: payload.event,
    producer: 'atlas-client',
    surface: payload.surface as ProductUsageSurface,
    route: payload.route ?? '/',
    entityType: payload.entityType as ProductUsageEntityType | undefined,
    entityId: payload.entityId,
    entityId2: payload.entityId2,
    outcome: (payload.outcome ?? 'success') as ProductUsageOutcome,
  })
  return new Response(null, { status: 204 })
}
