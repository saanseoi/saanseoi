import type {
  divisions,
  divisionsI18n,
  divisionsVersions,
  divisionsVersionsI18n,
} from './divisions'

export type DivisionRow = typeof divisions.$inferSelect
export type NewDivisionRow = typeof divisions.$inferInsert

export type DivisionI18nRow = typeof divisionsI18n.$inferSelect
export type NewDivisionI18nRow = typeof divisionsI18n.$inferInsert
export type DivisionI18nPayload = Omit<DivisionI18nRow, 'createdAt' | 'updatedAt'>

export type DivisionVersionRow = typeof divisionsVersions.$inferSelect
export type NewDivisionVersionRow = typeof divisionsVersions.$inferInsert

export type DivisionVersionI18nRow = typeof divisionsVersionsI18n.$inferSelect
export type NewDivisionVersionI18nRow = typeof divisionsVersionsI18n.$inferInsert

export type CurrentDivisionVersionRow = Pick<
  DivisionVersionRow,
  | 'id'
  | 'hierarchyJson'
  | 'level'
  | 'otBboxJson'
  | 'otCartographyJson'
  | 'otClass'
  | 'otGeometryJson'
  | 'otHierarchyJson'
  | 'otPopulation'
  | 'otSubtype'
  | 'otVersion'
  | 'otWikidata'
  | 'parentDivisionId'
  | 'sourcesJson'
  | 'type'
  | 'versionHash'
>
