/** Geographic classification is independent of source vocabulary and parentage. */
export const divisionTaxonomy = {
  major_island: { category: 'landform', level: null },
  minor_island: { category: 'landform', level: null },
  islet: { category: 'landform', level: null },
  island_group: { category: 'landform', level: null },
  country: { category: 'administrative', level: 0 },
  sar: { category: 'administrative', level: 0 },
  area: { category: 'administrative', level: 1 },
  district: { category: 'administrative', level: 2 },
  city: { category: 'locality', level: 1 },
  town: { category: 'locality', level: 3 },
  village: { category: 'locality', level: 5 },
  hamlet: { category: 'locality', level: 6 },
  macrohood: { category: 'hood', level: 4 },
  neighbourhood: { category: 'hood', level: 5 },
  microhood: { category: 'hood', level: 6 },
} as const

export type GeographicDivisionClass = keyof typeof divisionTaxonomy
export type DivisionCategory = 'administrative' | 'locality' | 'hood' | 'landform'

export function geographicDivisionClassification(value: string) {
  return Object.hasOwn(divisionTaxonomy, value)
    ? divisionTaxonomy[value as GeographicDivisionClass]
    : null
}

export type DivisionHierarchyEntry = {
  id: string
  name: string | null
  class: string
  /** This ancestor covers the owning division's entire area, including boundaries. */
  full_containment?: boolean | null
  /** Geometry identities for this assertion; null/absent evidence cannot skip checks. */
  containment_geometry?: { division: string; ancestor: string }
}

/** Materialised at ingestion; readers must not infer or compose ancestry. */
export type DivisionHierarchies = {
  administrative?: DivisionHierarchyEntry[][]
  locality?: DivisionHierarchyEntry[][]
  landform?: DivisionHierarchyEntry[][]
  full: DivisionHierarchyEntry[][]
}

export function emptyDivisionHierarchies(): DivisionHierarchies {
  return { full: [] }
}

/** Individual island land area in square kilometres; groups are classified separately. */
export function classifyIslandArea(areaKm2: number) {
  if (!Number.isFinite(areaKm2) || areaKm2 <= 0)
    throw new Error('Island area must be a finite, positive number')
  return areaKm2 >= 10 ? 'major_island' : areaKm2 >= 0.01 ? 'minor_island' : 'islet'
}
