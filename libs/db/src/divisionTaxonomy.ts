/** Geographic classification is independent of source vocabulary and parentage. */
export const divisionTaxonomy = {
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
export type DivisionCategory = 'administrative' | 'locality' | 'hood'

export function geographicDivisionClassification(value: string) {
  return Object.hasOwn(divisionTaxonomy, value)
    ? divisionTaxonomy[value as GeographicDivisionClass]
    : null
}

export type DivisionHierarchyEntry = {
  id: string
  name: string | null
  class: string
}

/** Materialised at ingestion; readers must not infer or compose ancestry. */
export type DivisionHierarchies = {
  administrative: DivisionHierarchyEntry[][]
  locality: DivisionHierarchyEntry[][]
  full: DivisionHierarchyEntry[][]
}

export function emptyDivisionHierarchies(): DivisionHierarchies {
  return { administrative: [], locality: [], full: [] }
}
