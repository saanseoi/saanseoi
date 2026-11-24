import type { FeatureCollection } from 'geojson'
export type Inventory = 'landsd' | 'overture'
export type Selection = { inventory: Inventory; id: string }
export type ReviewRow = {
  id: string
  name: string
  status: string
  minX: number
  minY: number
  maxX: number
  maxY: number
}
export type Match = {
  landsdId: string
  overtureId: string
  landsdCoverage: number
  overtureCoverage: number
  iou: number
  intersectionM2: number
  landsdAreaM2: number
  overtureAreaM2: number
  repaired: number
  name: string
  geometry: string
}
export type RecordDetail = {
  inventory: Inventory
  selected: { id: string; name: string; geometry: string }
  matches: Match[]
  category: { status: string } | null
}
export type Summary = {
  releases: Record<Inventory, string>
  counts: Record<Inventory, number>
  reviewCategories: Record<string, number>
  landsdOver99Percent: number
  mutualOver99Percent: number
  partialOnlyOver99Percent: number
  unrepairedUniqueMutual: number
  invalid: Record<Inventory, number>
}
export const emptyCollection = (): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
})
export const labels: Record<string, string> = {
  '': 'All LandsD buildings',
  mutual: 'Unique mutual >99%',
  partial: 'Partial · LandsD within Overture',
  'reverse-partial': 'Reverse partial · Overture within LandsD',
  ambiguous: 'Ambiguous match',
  overlap: 'Other overlap',
  unmatched: 'No overlapping footprint',
}
