import type {
  sourceOvertureDivisionAreas,
  sourceOvertureDivisionBoundaries,
} from './overture'

export type SourceDivisionAreaRow = typeof sourceOvertureDivisionAreas.$inferSelect
export type NewSourceDivisionAreaRow = typeof sourceOvertureDivisionAreas.$inferInsert
export type SourceDivisionBoundaryRow =
  typeof sourceOvertureDivisionBoundaries.$inferSelect
export type NewSourceDivisionBoundaryRow =
  typeof sourceOvertureDivisionBoundaries.$inferInsert
