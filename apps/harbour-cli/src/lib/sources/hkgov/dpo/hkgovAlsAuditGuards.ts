import type { AuditGuard } from '@repo/core/provenance'

const descriptions = {
  'unique-identities':
    'Each prepared address must have a unique identifier after duplicate resolution.',
  'inventory-source':
    'Reviewed unit corrections and exclusions must match the source identity and inventory.',
  'inventory-parent':
    'Each non-empty unit inventory must resolve to exactly one address.',
  'section-ownership':
    'A section may receive units only through a reviewed ownership relationship.',
  'shared-inventory-owner':
    'Repeated records for the same physical location must resolve to the same inventory owner.',
  'inventory-agreement':
    'Inventories assigned to the same address must contain the same units.',
  'inventory-size':
    'Each retained inventory record must fit the supported storage size.',
  'coordinate-source':
    'A coordinate replacement must match the reviewed source identity and original point.',
  'component-gap':
    'Missing components may be restored only when the reviewed bilingual source assertions match.',
} as const
export type AlsAuditGuardId = keyof typeof descriptions

/** Counts are recorded beside successful checks, never inferred from output totals. */
export function createAlsAuditGuards() {
  const counts = new Map<AlsAuditGuardId, number>()
  return {
    passed(id: AlsAuditGuardId, count = 1) {
      counts.set(id, (counts.get(id) ?? 0) + count)
    },
    results(): AuditGuard[] {
      return [...counts]
        .filter(([, checked]) => checked > 0)
        .map(([id, checked]) => ({
          id: `als-${id}`,
          summary: descriptions[id],
          consequence: 'block-ingestion',
          status: 'passed',
          checked,
          failed: 0,
          reason: 'The source records passed this check during address preparation.',
        }))
    },
  }
}
