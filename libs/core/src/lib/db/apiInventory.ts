/** Inventories are exposed primary resources, not arbitrary upstream dependencies. */
export class InventorySelectionError extends Error {
  readonly status = 409
  readonly code = 'inventory_unavailable'
}

type Member = {
  snapshotResourceType: string
  variant: string
  role: string
  snapshotId: string
}
export function selectApiInventory<T extends Member>(
  snapshots: T[],
  resourceType: string,
  inventory?: string,
): { inventory: string; snapshots: T[] } {
  const candidates = snapshots.filter(
    s =>
      s.snapshotResourceType === resourceType &&
      (s.role === 'primary' || s.role === 'inventory'),
  )
  const selected = inventory
    ? candidates.find(s => s.variant === inventory)
    : candidates.find(s => s.role === 'primary')
  if (!selected)
    throw new InventorySelectionError(
      `Inventory ${inventory ?? '(default)'} is unavailable in the selected release.`,
    )
  const geometryAllowed = (s: T) => {
    // Curated identities retain shared upstream IDs. Government companions are
    // joined by division identity; unrelated records never enter this inventory.
    if (selected.variant === 'saanseoi') return true
    return (
      s.variant === selected.variant ||
      (selected.variant === 'overture' &&
        /^hkgov-(had|censtatd)(:|-|$)/.test(s.variant))
    )
  }
  const companions = snapshots.filter(
    s => s.snapshotResourceType !== resourceType && geometryAllowed(s),
  )
  companions.sort(
    (a, b) =>
      Number(b.variant === selected.variant) - Number(a.variant === selected.variant),
  )
  return {
    inventory: selected.variant,
    snapshots: [{ ...selected, role: 'primary' }, ...companions],
  }
}
