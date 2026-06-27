import type { divisions, divisionsI18n } from './divisions'

export type DivisionRow = typeof divisions.$inferSelect
export type NewDivisionRow = typeof divisions.$inferInsert

export type DivisionI18nRow = typeof divisionsI18n.$inferSelect
export type NewDivisionI18nRow = typeof divisionsI18n.$inferInsert
export type DivisionI18nPayload = Omit<
  DivisionI18nRow,
  'apiReleaseSetId' | 'createdAt' | 'updatedAt'
>
