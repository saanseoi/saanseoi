import type { HarbourReadableDb } from '../../../lib/db/types'
import {
  buildSearchContentSql,
  buildSearchSyncSql,
  createSearchFtsSql,
  resolvePublishedSearchScopes,
  synchroniseSearchIndexes,
  type SearchIndexDefinition,
  type SearchScope,
  type SearchD1Database,
} from '../search/incrementalIndex'

export type AddressSearchScope = SearchScope
export const addressSearchIndex: SearchIndexDefinition = {
  label: 'Address',
  resourceType: 'address',
  domainCode: 'saanseoi',
  table: 'addressSearchFts',
  scopesTable: 'addressSearchScopes',
  retiredTable: 'addressesFts',
  fields: [
    'scopeId',
    'addressId',
    'locale',
    'formattedAddress',
    'buildingName',
    'buildingNumber',
    'blockExpression',
    'phaseExpression',
    'estateName',
    'streetName',
  ],
  unindexed: ['scopeId', 'addressId', 'locale'],
  selectSql: `SELECT s.scopeId, i.addressId, i.locale, i.formattedAddress, i.buildingName,
    TRIM(COALESCE(i.buildingNumberExpression, '') || ' ' ||
      COALESCE(i.buildingNumberFrom, '') || ' ' || COALESCE(i.buildingNumberTo, '')) AS buildingNumber,
    i.blockExpression, i.phaseExpression, i.estateName, i.streetName
    FROM selected s JOIN address2dI18n i ON i.snapshotId = s.snapshotId`,
}
export const createAddressSearchFtsSql = createSearchFtsSql(addressSearchIndex)
export const resolveAddressSearchScopes = (db: HarbourReadableDb) =>
  resolvePublishedSearchScopes(db, addressSearchIndex)
export const buildAddressSearchSyncSql = (scopes: readonly SearchScope[]) =>
  buildSearchSyncSql(addressSearchIndex, scopes)
export const buildAddressSearchContentSql = (selection?: string) =>
  buildSearchContentSql(addressSearchIndex, selection)
export const synchroniseAddressSearch = (
  db: HarbourReadableDb,
  current: SearchD1Database,
) => synchroniseSearchIndexes(db, current, [addressSearchIndex])
