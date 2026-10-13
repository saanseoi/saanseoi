import type { HistoryContent } from '../../historyContent'
import type * as current from '../current'
import type { places, placesI18n } from './places'
export type PlaceVersionRow = HistoryContent<
  typeof places.$inferSelect,
  typeof current.places.$inferSelect
>
export type PlaceVersionI18nRow = HistoryContent<
  typeof placesI18n.$inferSelect,
  typeof current.placesI18n.$inferSelect
>
