import type { divisionsVersions, divisionsVersionsI18n } from './divisions'

export type DivisionVersionRow = typeof divisionsVersions.$inferSelect
export type NewDivisionVersionRow = typeof divisionsVersions.$inferInsert

export type DivisionVersionI18nRow = typeof divisionsVersionsI18n.$inferSelect
export type NewDivisionVersionI18nRow = typeof divisionsVersionsI18n.$inferInsert

export type CurrentDivisionVersionRow = Pick<
  DivisionVersionRow,
  | 'id'
  | 'hierarchy'
  | 'level'
  | 'bbox'
  | 'cartography'
  | 'class'
  | 'geometry'
  | 'population'
  | 'subtype'
  | 'wikidata'
  | 'parentDivisionId'
  | 'sources'
  | 'type'
  | 'versionHash'
>
