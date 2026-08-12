import type { divisionAreas, divisionBoundaries } from './divisionGeometry'

export type DivisionAreaVersionRow = typeof divisionAreas.$inferSelect
export type NewDivisionAreaVersionRow = typeof divisionAreas.$inferInsert
export type DivisionBoundaryVersionRow = typeof divisionBoundaries.$inferSelect
export type NewDivisionBoundaryVersionRow = typeof divisionBoundaries.$inferInsert
