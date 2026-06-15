import type { address2d, address2dI18n, address3d, address3dI18n } from './addresses'

export type AddressRow = typeof address2d.$inferSelect
export type NewAddressRow = typeof address2d.$inferInsert

export type AddressI18nRow = typeof address2dI18n.$inferSelect
export type NewAddressI18nRow = typeof address2dI18n.$inferInsert
export type AddressI18nPayload = Omit<AddressI18nRow, 'createdAt' | 'updatedAt'>

export type Address3dRow = typeof address3d.$inferSelect
export type NewAddress3dRow = typeof address3d.$inferInsert
export type Address3dI18nRow = typeof address3dI18n.$inferSelect
export type NewAddress3dI18nRow = typeof address3dI18n.$inferInsert
