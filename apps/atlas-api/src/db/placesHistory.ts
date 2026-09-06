import type { HistoryDatabase } from '@repo/db'
import { historySchema, inArray } from '@repo/db'
import type { RequestedApiLocaleSelection } from '@repo/core/apiLocales'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  groupResolvedVersionsByShard,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils.ts'

import { listReplayedAddressRecords } from './addressesHistory'
import type { AddressRecord } from './addresses'
import { normalisePlaceBbox, type PlaceLocaleValue, type PlaceRecord } from './places'

type HistoryPlace = typeof historySchema.places.$inferSelect
type HistoryPlaceI18n = typeof historySchema.placesI18n.$inferSelect

function localeIsSelected(selection: RequestedApiLocaleSelection, locale: string) {
  return (
    selection.mode !== 'none' &&
    (selection.mode === 'all' || selection.locales.includes(locale))
  )
}

function mapPlaceLocale(row: HistoryPlaceI18n): PlaceLocaleValue {
  const stringArray = (value: unknown) => {
    const parsed =
      typeof value === 'string'
        ? (() => {
            try {
              return JSON.parse(value) as unknown
            } catch {
              return null
            }
          })()
        : value
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : null
  }

  return {
    name: row.name,
    nameVariant: stringArray(row.nameVariant),
    nameAlts: row.nameAlts,
    brandName: row.brandName,
    brandNameVariant: stringArray(row.brandNameVariant),
    brandNameAlts: row.brandNameAlts,
    freeformAddress: row.freeformAddress,
    accessHint: row.accessHint,
    provenance: row.provenance,
  }
}

function addressDivisionIds(address: AddressRecord['address'] | undefined) {
  if (!address) return []
  return [
    address.countryId,
    address.areaId,
    address.districtId,
    address.townId,
    address.macrohoodId,
    address.neighbourhoodId,
    address.villageId,
    address.microhoodId,
    address.hamletId,
  ].filter((id): id is string => Boolean(id))
}

type PlaceVersionRef = {
  recordId: string
  locale: string
  versionHash: string
  shard: { bindingName: string; db: HistoryDatabase }
}

async function loadPlaceRows(versions: Iterable<PlaceVersionRef>) {
  const rows: HistoryPlace[] = []
  for (const shardVersions of groupResolvedVersionsByShard(
    versions as never,
  ).values()) {
    const first = shardVersions.at(0)
    if (!first) continue
    const expected = new Set(
      shardVersions.map(version => `${version.recordId}\u0000${version.versionHash}`),
    )
    const hashes = [...new Set(shardVersions.map(version => version.versionHash))]
    const found = (
      await Promise.all(
        chunkArray(hashes, getMaxItemsPerInClause()).map(versionHashes =>
          first.shard.db
            .select()
            .from(historySchema.places)
            .where(inArray(historySchema.places.versionHash, versionHashes))
            .all(),
        ),
      )
    ).flat() as HistoryPlace[]
    for (const row of found) {
      if (expected.has(`${row.id}\u0000${row.versionHash}`)) rows.push(row)
    }
  }
  return rows
}

async function loadPlaceI18nRows(versions: Iterable<PlaceVersionRef>) {
  const rows: HistoryPlaceI18n[] = []
  for (const shardVersions of groupResolvedVersionsByShard(
    versions as never,
  ).values()) {
    const first = shardVersions.at(0)
    if (!first) continue
    const expected = new Set(
      shardVersions.map(
        version =>
          `${version.recordId}\u0000${version.locale}\u0000${version.versionHash}`,
      ),
    )
    const hashes = [...new Set(shardVersions.map(version => version.versionHash))]
    const found = (
      await Promise.all(
        chunkArray(hashes, getMaxItemsPerInClause()).map(versionHashes =>
          first.shard.db
            .select()
            .from(historySchema.placesI18n)
            .where(inArray(historySchema.placesI18n.versionHash, versionHashes))
            .all(),
        ),
      )
    ).flat() as HistoryPlaceI18n[]
    for (const row of found) {
      if (expected.has(`${row.placeId}\u0000${row.locale}\u0000${row.versionHash}`)) {
        rows.push(row)
      }
    }
  }
  return rows
}

export async function listReplayedPlaceRecords(args: {
  divisionSnapshotId: string
  historyDbsByBinding: Record<string, HistoryDatabase>
  localeSelection: RequestedApiLocaleSelection
  metaDb: unknown
  snapshotId: string
}): Promise<PlaceRecord[]> {
  const shards = new Map(
    Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db },
    ]),
  )
  const plan = await resolveSnapshotReplayPlan(args.metaDb as never, args.snapshotId)
  const versions = await resolveSnapshotVersionState(plan, shards as never, [
    'place',
    'placeI18n',
  ])
  const places = await loadPlaceRows(
    [...versions.values()].filter(version => version.recordType === 'place') as never,
  )
  const localised = await loadPlaceI18nRows(
    [...versions.values()].filter(
      version => version.recordType === 'placeI18n',
    ) as never,
  )
  const localisedByPlace = new Map<string, Record<string, PlaceLocaleValue>>()
  for (const row of localised) {
    const values = localisedByPlace.get(row.placeId) ?? {}
    values[row.locale] = mapPlaceLocale(row)
    localisedByPlace.set(row.placeId, values)
  }

  const addressRefs = new Map<string, Set<string>>()
  for (const row of places) {
    if (!row.addressSnapshotId || !row.address2dId) continue
    const ids = addressRefs.get(row.addressSnapshotId) ?? new Set<string>()
    ids.add(row.address2dId)
    addressRefs.set(row.addressSnapshotId, ids)
  }
  const addressesBySnapshot = new Map<string, Map<string, AddressRecord['address']>>()
  for (const [addressSnapshotId, addressIds] of addressRefs) {
    const addresses = await listReplayedAddressRecords({
      divisionSnapshotId: args.divisionSnapshotId,
      historyDbsByBinding: args.historyDbsByBinding,
      localeSelection: { mode: 'none', locales: [] },
      metaDb: args.metaDb,
      snapshotIds: [addressSnapshotId],
    })
    addressesBySnapshot.set(
      addressSnapshotId,
      new Map(
        addresses
          .filter(address => addressIds.has(address.address.id))
          .map(address => [address.address.id, address.address]),
      ),
    )
  }

  return places.map(row => {
    const i18n = Object.fromEntries(
      Object.entries(localisedByPlace.get(row.id) ?? {}).filter(([locale]) =>
        localeIsSelected(args.localeSelection, locale),
      ),
    )
    const address = row.addressSnapshotId
      ? addressesBySnapshot.get(row.addressSnapshotId)?.get(row.address2dId ?? '')
      : undefined
    return {
      place: {
        ...row,
        snapshotId: args.snapshotId,
        bbox: normalisePlaceBbox(row.bbox),
      },
      i18n,
      divisionIds: addressDivisionIds(address),
    } as PlaceRecord
  })
}
