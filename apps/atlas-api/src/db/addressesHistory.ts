import type { HistoryDatabase } from '@repo/db'
import type { RequestedApiLocaleSelection } from '@repo/core'
import { getReplayedAddressVersionMap } from '@repo/core/pipeline/db/address.ts'

import type { AddressLocaleValue, AddressRecord } from './addresses'

type HistoryShard = {
  bindingName: string
  db: HistoryDatabase
}

function localeIsSelected(selection: RequestedApiLocaleSelection, locale: string) {
  return (
    selection.mode !== 'none' &&
    (selection.mode === 'all' || selection.locales.includes(locale))
  )
}

function mapLocaleValue(value: {
  formattedAddress: string
  buildingName: string | null
  buildingNumberExpression: string | null
  buildingNumberFrom: string | null
  buildingNumberTo: string | null
  buildingNumberConnector: string | null
  blockExpression: string | null
  blockType: AddressLocaleValue['blockType']
  blockRef: string | null
  blockTypeBeforeNumber: boolean | null
  phaseExpression: string | null
  phaseName: string | null
  phaseRef: string | null
  estateName: string | null
  streetName: string | null
}): AddressLocaleValue {
  return {
    formattedAddress: value.formattedAddress,
    buildingName: value.buildingName,
    buildingNumberExpression: value.buildingNumberExpression,
    buildingNumberFrom: value.buildingNumberFrom,
    buildingNumberTo: value.buildingNumberTo,
    buildingNumberConnector: value.buildingNumberConnector,
    blockExpression: value.blockExpression,
    blockType: value.blockType,
    blockRef: value.blockRef,
    blockTypeBeforeNumber: value.blockTypeBeforeNumber,
    phaseExpression: value.phaseExpression,
    phaseName: value.phaseName,
    phaseRef: value.phaseRef,
    estateName: value.estateName,
    streetName: value.streetName,
  }
}

/** Replays retained versions so a selected historic release cannot read current rows. */
export async function listReplayedAddressRecords(args: {
  divisionSnapshotId: string
  historyDbsByBinding: Record<string, HistoryDatabase>
  localeSelection: RequestedApiLocaleSelection
  metaDb: unknown
  snapshotIds: string[]
}): Promise<AddressRecord[]> {
  const shards = new Map<string, HistoryShard>(
    Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db },
    ]),
  )
  const versionsBySnapshot = await Promise.all(
    args.snapshotIds.map(snapshotId =>
      getReplayedAddressVersionMap(args.metaDb as never, snapshotId, shards as never, {
        buildAddressBaseHashInput: value => value,
        buildMatchKey: () => null,
        normaliseAddressI18nSnapshotRow: value => value,
      }),
    ),
  )

  return versionsBySnapshot.flatMap((versions, index) => {
    const snapshotId = args.snapshotIds[index]
    if (!snapshotId) return []

    return [...versions.values()].map(version => ({
      address: {
        snapshotId,
        divisionSnapshotId: args.divisionSnapshotId,
        id: version.id,
        geometry: version.base.geometry,
        bbox: version.base.bbox,
        identifiers: version.base.identifiers,
        sources: version.base.sources,
        countryId: version.base.countryId,
        areaId: version.base.areaId,
        districtId: version.base.districtId,
        townId: version.base.townId,
        macrohoodId: version.base.macrohoodId,
        neighbourhoodId: version.base.neighbourhoodId,
        microhoodId: version.base.microhoodId,
        villageId: version.base.villageId,
        hamletId: version.base.hamletId,
        createdAt: version.base.createdAt,
        updatedAt: version.base.updatedAt,
      },
      i18n: Object.fromEntries(
        version.localisedRows.flatMap(value =>
          localeIsSelected(args.localeSelection, value.locale)
            ? [[value.locale, mapLocaleValue(value)]]
            : [],
        ),
      ),
    }))
  })
}
