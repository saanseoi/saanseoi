import type {
  address2dVersions,
  address2dVersionsI18n,
  address3dVersions,
  address3dVersionsI18n,
} from './addresses'

export type AddressVersionRow = typeof address2dVersions.$inferSelect
export type NewAddressVersionRow = typeof address2dVersions.$inferInsert

export type AddressVersionI18nRow = typeof address2dVersionsI18n.$inferSelect
export type NewAddressVersionI18nRow = typeof address2dVersionsI18n.$inferInsert

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

export type Address3dVersionRow = typeof address3dVersions.$inferSelect
export type NewAddress3dVersionRow = typeof address3dVersions.$inferInsert
export type Address3dVersionI18nRow = typeof address3dVersionsI18n.$inferSelect
export type NewAddress3dVersionI18nRow = typeof address3dVersionsI18n.$inferInsert
