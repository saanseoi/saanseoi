import type { divisionAreas, divisionBoundaries } from './divisionGeometry'

export type DivisionAreaRow = typeof divisionAreas.$inferSelect
export type NewDivisionAreaRow = typeof divisionAreas.$inferInsert
export type DivisionBoundaryRow = typeof divisionBoundaries.$inferSelect
export type NewDivisionBoundaryRow = typeof divisionBoundaries.$inferInsert
