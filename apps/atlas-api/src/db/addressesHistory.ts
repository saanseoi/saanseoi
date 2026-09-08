import type { HistoryDatabase } from '@repo/db'
import { and, asc, eq, historySchema, sql } from '@repo/db'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { RequestedApiLocaleSelection } from '@repo/core'
import { getReplayedAddressVersionMap } from '@repo/core/pipeline/db/address.ts'
import { buildAddressBuildingNumberLookupRows } from '@repo/core/pipeline/services/addressPipeline/normalisation.ts'

import type {
  AddressLocaleValue,
  AddressRecord,
  AddressSearchComponent,
  AddressSearchMode,
} from './addresses'

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
  recordIds?: string[]
  replayPlans?: Map<string, Awaited<ReturnType<typeof resolveSnapshotReplayPlan>>>
}): Promise<AddressRecord[]> {
  const shards = new Map<string, HistoryShard>(
    Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db },
    ]),
  )
  const versionsBySnapshot = await Promise.all(
    args.snapshotIds.map(snapshotId =>
      getReplayedAddressVersionMap(
        args.metaDb as never,
        snapshotId,
        shards as never,
        {
          buildAddressBaseHashInput: value => value,
          buildMatchKey: () => null,
          normaliseAddressI18nSnapshotRow: value => value,
        },
        {
          recordIds: args.recordIds,
          includeLocales: args.localeSelection.mode !== 'none',
          plan: args.replayPlans?.get(snapshotId),
        },
      ),
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
        parentAddressId: version.base.parentAddressId,
        granularity: version.base.granularity,
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

/** Walk compact ID windows, stopping after one matching record beyond the page. */
export async function listReplayedAddressPage(
  args: Parameters<typeof listReplayedAddressRecords>[0] & {
    limit: number
    offset: number
    countryId?: string
    areaId?: string
    districtId?: string
    search?: Parameters<typeof searchReplayedAddressRecords>[1]
  },
) {
  const plans = await Promise.all(
    args.snapshotIds.map(id => resolveSnapshotReplayPlan(args.metaDb as never, id)),
  )
  const replayPlans = new Map(args.snapshotIds.map((id, index) => [id, plans[index]!]))
  const snapshotIdsByBinding = new Map<string, Set<string>>()
  for (const plan of plans)
    for (const step of plan)
      for (const shard of step.shards) {
        const ids = snapshotIdsByBinding.get(shard.bindingName) ?? new Set<string>()
        ids.add(step.snapshotId)
        snapshotIdsByBinding.set(shard.bindingName, ids)
      }
  const selected: Array<{ id: string; snapshotId: string }> = []
  let skipped = 0
  let after: string | undefined
  let hasMore = false
  outer: for (;;) {
    let candidates: string[] = []
    for (const [binding, snapshots] of snapshotIdsByBinding) {
      const db = args.historyDbsByBinding[binding]
      if (!db) throw new Error(`Unavailable history binding ${binding}.`)
      const journal = historySchema.snapshotVersionChanges
      const rows = await db
        .selectDistinct({ id: journal.recordId })
        .from(journal)
        .where(
          and(
            sql`${journal.snapshotId} in (select value from json_each(${JSON.stringify([...snapshots])}))`,
            eq(journal.recordType, 'address2d'),
            after === undefined ? undefined : sql`${journal.recordId} > ${after}`,
          ),
        )
        .orderBy(asc(journal.recordId))
        .limit(100)
        .all()
      candidates = [...new Set([...candidates, ...rows.map(row => row.id)])]
        .sort()
        .slice(0, 100)
    }
    if (!candidates.length) break
    const records = await listReplayedAddressRecords({
      ...args,
      recordIds: candidates,
      replayPlans,
      localeSelection: args.search
        ? { mode: 'all', locales: ['*'] }
        : { mode: 'none', locales: [] },
    })
    records.sort((a, b) =>
      a.address.id < b.address.id ? -1 : a.address.id > b.address.id ? 1 : 0,
    )
    for (const { address } of args.search
      ? searchReplayedAddressRecords(records, args.search)
      : records) {
      if (
        (args.countryId && address.countryId !== args.countryId) ||
        (args.areaId && address.areaId !== args.areaId) ||
        (args.districtId && address.districtId !== args.districtId)
      )
        continue
      if (skipped < args.offset) {
        skipped++
        continue
      }
      if (selected.length === args.limit) {
        hasMore = true
        break outer
      }
      selected.push({ id: address.id, snapshotId: address.snapshotId })
    }
    after = candidates.at(-1)
  }
  const records = selected.length
    ? await listReplayedAddressRecords({
        ...args,
        recordIds: [...new Set(selected.map(row => row.id))],
        replayPlans,
      })
    : []
  const byKey = new Map(
    records.map(row => [`${row.address.snapshotId}\u0000${row.address.id}`, row]),
  )
  return {
    records: selected.flatMap(
      row => byKey.get(`${row.snapshotId}\u0000${row.id}`) ?? [],
    ),
    hasMore,
  }
}

export function selectReplayedAddressLocales(
  records: AddressRecord[],
  selection: RequestedApiLocaleSelection,
) {
  return records.map(record => ({
    ...record,
    i18n: Object.fromEntries(
      Object.entries(record.i18n).filter(([locale]) =>
        localeIsSelected(selection, locale),
      ),
    ),
  }))
}

const ADDRESS_SEARCH_FIELD_BY_COMPONENT: Record<
  AddressSearchComponent,
  keyof AddressLocaleValue | readonly (keyof AddressLocaleValue)[]
> = {
  block: 'blockExpression',
  building: 'buildingName',
  estate: 'estateName',
  formatted: 'formattedAddress',
  number: ['buildingNumberExpression', 'buildingNumberFrom', 'buildingNumberTo'],
  phase: 'phaseExpression',
  street: 'streetName',
}
const ADDRESS_SEARCH_ALL_FIELDS: readonly (keyof AddressLocaleValue)[] = [
  'formattedAddress',
  'buildingName',
  'buildingNumberExpression',
  'buildingNumberFrom',
  'buildingNumberTo',
  'blockExpression',
  'phaseExpression',
  'estateName',
  'streetName',
]

const ADDRESS_SEARCH_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['blk', 'blks', 'block', 'blocks'],
  ['bldg', 'bldgs', 'building', 'buildings'],
  ['twr', 'tower', 'towers'],
  ['hse', 'hses', 'house', 'houses'],
  ['apt', 'apts', 'apartment', 'apartments'],
]
const ADDRESS_SEARCH_ALIASES = new Map<string, readonly string[]>(
  ADDRESS_SEARCH_ALIAS_GROUPS.flatMap(values =>
    values.map(value => [value, values] as const),
  ),
)

function searchTokens(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .split(/[\s,;，、]+/u)
    .map(token => token.replaceAll(/[^\p{L}\p{N}]+/gu, '').toLocaleLowerCase('en'))
    .filter(Boolean)
}

function searchTextMatches(
  value: string,
  queryTokens: string[],
  mode: AddressSearchMode,
) {
  const textTokens = new Set(searchTokens(value))
  return queryTokens.every(token =>
    (ADDRESS_SEARCH_ALIASES.get(token) ?? [token]).some(alias =>
      mode === 'prefix'
        ? [...textTokens].some(text => text.startsWith(alias))
        : textTokens.has(alias),
    ),
  )
}

/** Searches replayed records using the same token vocabulary as the current FTS index. */
export function searchReplayedAddressRecords(
  records: AddressRecord[],
  lookup: {
    component?: AddressSearchComponent
    mode: AddressSearchMode
    query: string
  },
) {
  const queryTokens = searchTokens(lookup.query)
  if (queryTokens.length === 0) return []

  if (lookup.mode === 'exact' || lookup.mode === 'range') {
    const number = lookup.query.normalize('NFKC').trim().toLocaleUpperCase('en')
    if (!/^\d+[A-Z]?$/.test(number)) return []
    return records.filter(record =>
      buildAddressBuildingNumberLookupRows(
        Object.values(record.i18n).map(value => ({
          ...value,
          addressId: record.address.id,
        })),
      ).some(
        row =>
          row.buildingNumber === number &&
          (lookup.mode === 'range' || row.evidence !== 'derived_member'),
      ),
    )
  }

  const field = lookup.component
    ? ADDRESS_SEARCH_FIELD_BY_COMPONENT[lookup.component]
    : undefined
  return records.filter(record =>
    Object.values(record.i18n).some(value => {
      const values = field
        ? typeof field === 'string'
          ? [value[field]]
          : field.map(key => value[key])
        : ADDRESS_SEARCH_ALL_FIELDS.map(key => value[key])
      return searchTextMatches(
        values.filter((item): item is string => typeof item === 'string').join(' '),
        queryTokens,
        lookup.mode,
      )
    }),
  )
}
