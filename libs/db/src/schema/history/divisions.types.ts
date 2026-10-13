import type { HistoryContent } from '../../historyContent'
import type * as current from '../current'
import type { divisions, divisionsI18n } from './divisions'

export type DivisionVersionRow = HistoryContent<
  typeof divisions.$inferSelect,
  typeof current.divisions.$inferSelect
>
export type NewDivisionVersionRow = typeof divisions.$inferInsert

export type DivisionVersionI18nRow = HistoryContent<
  typeof divisionsI18n.$inferSelect,
  typeof current.divisionsI18n.$inferSelect
>
export type NewDivisionVersionI18nRow = typeof divisionsI18n.$inferInsert

export type CurrentDivisionVersionRow = Pick<
  DivisionVersionRow,
  | 'id'
  | 'divisionCode'
  | 'identifiers'
  | 'hierarchies'
  | 'level'
  | 'cartography'
  | 'geometry'
  | 'sources'
  | 'class'
  | 'category'
  | 'versionHash'
>
