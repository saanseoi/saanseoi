import type { HistoryContent } from '../../historyContent'
import type * as current from '../current'
import type { streetGeometry } from './streetGeometry'

export type StreetGeometryVersionRow = HistoryContent<
  typeof streetGeometry.$inferSelect,
  typeof current.streetGeometry.$inferSelect
>
export type NewStreetGeometryVersionRow = typeof streetGeometry.$inferInsert
