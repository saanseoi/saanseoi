import type { HistoryContent } from '../../historyContent'
import type * as current from '../current'
import type { divisionAreas, divisionBoundaries } from './divisionGeometry'

export type DivisionAreaVersionRow = HistoryContent<
  typeof divisionAreas.$inferSelect,
  typeof current.divisionAreas.$inferSelect
>
export type NewDivisionAreaVersionRow = typeof divisionAreas.$inferInsert
export type DivisionBoundaryVersionRow = HistoryContent<
  typeof divisionBoundaries.$inferSelect,
  typeof current.divisionBoundaries.$inferSelect
>
export type NewDivisionBoundaryVersionRow = typeof divisionBoundaries.$inferInsert
