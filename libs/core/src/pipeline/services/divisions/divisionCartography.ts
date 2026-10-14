import { materialiseDivisionCartography } from '@repo/db'
import type { BranchCounts } from '../../../provenance/branches'

/** Count the executed cartography choice in the retained normalisation audit. */
export function normaliseDivisionCartography(
  classification: string,
  publisher?: 'hkgov-landsd',
  counts?: BranchCounts,
  before?: unknown,
) {
  const value = materialiseDivisionCartography(classification, publisher)
  if (counts) {
    const id = `cartography.${publisher === 'hkgov-landsd' ? 'landsd' : 'class'}.${classification}`
    const count = counts[id]
    if (!count) throw new Error(`Unregistered processing branch: ${id}`)
    count.matched++
    const prior = before as Partial<typeof value> | null | undefined
    if (
      !prior ||
      prior.minZoom !== value.minZoom ||
      prior.maxZoom !== value.maxZoom ||
      prior.prominence !== value.prominence
    )
      count.changed++
  }
  return value
}
