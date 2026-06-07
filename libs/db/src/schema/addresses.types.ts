import type {
  address2d,
  address2dI18n,
  address2dVersions,
  address2dVersionsDatasets,
  address2dVersionsI18n,
  address3d,
  address3dI18n,
  address3dVersions,
  address3dVersionsI18n,
} from './addresses'

export type AddressRow = typeof address2d.$inferSelect
export type NewAddressRow = typeof address2d.$inferInsert

export type AddressI18nRow = typeof address2dI18n.$inferSelect
export type NewAddressI18nRow = typeof address2dI18n.$inferInsert
export type AddressI18nPayload = Omit<AddressI18nRow, 'createdAt' | 'updatedAt'>

export type AddressVersionRow = typeof address2dVersions.$inferSelect
export type NewAddressVersionRow = typeof address2dVersions.$inferInsert

export type AddressVersionDatasetRow = typeof address2dVersionsDatasets.$inferSelect
export type NewAddressVersionDatasetRow = typeof address2dVersionsDatasets.$inferInsert

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
  | 'identifiersJson'
  | 'otStreet'
  | 'otNumber'
  | 'otBboxJson'
  | 'otVersion'
  | 'sourcesJson'
  | 'versionHash'
>

export type Address3dRow = typeof address3d.$inferSelect
export type NewAddress3dRow = typeof address3d.$inferInsert
export type Address3dI18nRow = typeof address3dI18n.$inferSelect
export type NewAddress3dI18nRow = typeof address3dI18n.$inferInsert
export type Address3dVersionRow = typeof address3dVersions.$inferSelect
export type NewAddress3dVersionRow = typeof address3dVersions.$inferInsert
export type Address3dVersionI18nRow = typeof address3dVersionsI18n.$inferSelect
export type NewAddress3dVersionI18nRow = typeof address3dVersionsI18n.$inferInsert
