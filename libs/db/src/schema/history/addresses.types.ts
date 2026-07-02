import type { address2d, address2dI18n, address3d, address3dI18n } from './addresses'

export type AddressVersionRow = typeof address2d.$inferSelect
export type NewAddressVersionRow = typeof address2d.$inferInsert

export type AddressVersionI18nRow = typeof address2dI18n.$inferSelect
export type NewAddressVersionI18nRow = typeof address2dI18n.$inferInsert

export type CurrentAddressVersionRow = Pick<
  AddressVersionRow,
  | 'id'
  | 'streetId'
  | 'hamletId'
  | 'microhoodId'
  | 'villageId'
  | 'neighbourhoodId'
  | 'macrohoodId'
  | 'townId'
  | 'districtId'
  | 'areaId'
  | 'countryId'
  | 'geometry'
  | 'identifiers'
  | 'bbox'
  | 'sources'
  | 'versionHash'
>

export type Address3dVersionRow = typeof address3d.$inferSelect
export type NewAddress3dVersionRow = typeof address3d.$inferInsert
export type Address3dVersionI18nRow = typeof address3dI18n.$inferSelect
export type NewAddress3dVersionI18nRow = typeof address3dI18n.$inferInsert
