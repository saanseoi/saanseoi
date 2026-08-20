import {
  recordProductUsage,
  type ProductUsageEntityType,
  type ProductUsageEventName,
  type ProductUsageOutcome,
  type ProductUsageSurface,
} from '@repo/core/productUsage'
import { getRequestEvent } from '$app/server'
export { trackClientProductUsage } from './clientProductUsage.js'

export type ClientProductUsageInput = {
  event: ProductUsageEventName
  surface: ProductUsageSurface
  route?: string
  entityType?: ProductUsageEntityType
  entityId?: string
  entityId2?: string
  outcome?: ProductUsageOutcome
}

export function writeServerProductUsage(
  input: Omit<ClientProductUsageInput, 'route'> & {
    route?: string
    httpStatus?: number
    durationMs?: number
  },
) {
  const event = getRequestEvent()
  recordProductUsage(event.platform?.env.PRODUCT_USAGE, {
    event: input.event,
    producer: 'atlas-app',
    surface: input.surface,
    route: input.route ?? event.url.pathname,
    entityType: input.entityType,
    entityId: input.entityId,
    entityId2: input.entityId2,
    outcome: input.outcome ?? 'success',
    httpStatus: input.httpStatus,
    durationMs: input.durationMs,
  })
}
