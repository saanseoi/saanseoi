import type {
  ProductUsageEntityType,
  ProductUsageEventName,
  ProductUsageOutcome,
  ProductUsageSurface,
} from '@repo/core/productUsage'

export type ClientProductUsageInput = {
  event: ProductUsageEventName
  surface: ProductUsageSurface
  route?: string
  entityType?: ProductUsageEntityType
  entityId?: string
  entityId2?: string
  outcome?: ProductUsageOutcome
}

/**
 * Fire-and-forget, same-origin fallback for interactions without a useful
 * endpoint. `keepalive` gives navigation and download clicks a delivery window.
 */
export function trackClientProductUsage(input: ClientProductUsageInput): void {
  if (typeof window === 'undefined') return
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event: input.event,
      surface: input.surface,
      route: input.route ?? window.location.pathname,
      entityType: input.entityType,
      entityId: input.entityId,
      entityId2: input.entityId2,
      outcome: input.outcome ?? 'success',
    }),
    keepalive: true,
  }).catch(() => {
    // Analytics is optional and must never affect the interaction.
  })
}
