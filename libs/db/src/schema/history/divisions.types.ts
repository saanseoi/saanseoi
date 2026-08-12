import type { divisions, divisionsI18n } from './divisions'

export type DivisionVersionRow = typeof divisions.$inferSelect
export type NewDivisionVersionRow = typeof divisions.$inferInsert

export type DivisionVersionI18nRow = typeof divisionsI18n.$inferSelect
export type NewDivisionVersionI18nRow = typeof divisionsI18n.$inferInsert

export type CurrentDivisionVersionRow = Pick<
  DivisionVersionRow,
  | 'id'
  | 'identifiers'
  | 'hierarchy'
  | 'level'
  | 'bbox'
  | 'cartography'
  | 'geometry'
  | 'sourceKeys'
  | 'wikidata'
  | 'sources'
  | 'type'
  | 'versionHash'
>
