import { createHash } from '@repo/core/pipeline/utils'
import { establishAddressGranularity } from '@repo/core/pipeline/services/addresses/granularity'
import { buildAddressBuildingNumberLookupRows } from '@repo/core/pipeline/services/addresses/normalisation'
import { currentSchema, type SourceAttribution } from '@repo/db'
import { eq } from 'drizzle-orm'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type {
  StagedAddressResolution,
  SupplementaryEntry,
} from './supplementaryPlaceAddress.ts'

export const SUPPLEMENTARY_ADDRESS_VARIANT = 'overture-places'
export const ADDRESS_DIVISION_FIELDS = [
  'countryId',
  'landformId',
  'areaId',
  'districtId',
  'townId',
  'ruralAreaId',
  'macrohoodId',
  'villageId',
  'neighbourhoodId',
  'hamletId',
  'microhoodId',
] as const
type Address = typeof currentSchema.address2d.$inferSelect
type AddressDivisionReference = Pick<
  Address,
  | 'landformId'
  | 'areaId'
  | 'countryId'
  | 'districtId'
  | 'divisionSnapshotId'
  | 'hamletId'
  | 'id'
  | 'ruralAreaId'
  | 'macrohoodId'
  | 'microhoodId'
  | 'neighbourhoodId'
  | 'scopeId'
  | 'townId'
  | 'villageId'
>

/** Produces complete snapshot rows from durable curation, never a fresh text parse. */
export async function buildSupplementaryAddressRows(input: {
  resolutions: StagedAddressResolution[]
  officialAddresses: Map<string, AddressDivisionReference>
  snapshotId: string
  divisionSnapshotId: string
  sourceVersion: string
  datasetCode: string
}) {
  const groups = new Map<string, SupplementaryEntry[]>()
  for (const resolution of input.resolutions) {
    if (resolution.tier === 'review')
      throw new Error('Unresolved supplementary address review.')
    if (resolution.tier !== 'supplementary') continue
    if (!resolution.entry || resolution.entry.addressId !== resolution.addressId)
      throw new Error('Missing accepted supplementary address entry.')
    const entries = groups.get(resolution.entry.addressId) ?? []
    entries.push(resolution.entry)
    groups.set(resolution.entry.addressId, entries)
  }
  const rows = []
  for (const [id, entries] of groups) {
    entries.sort((a, b) => a.placeId.localeCompare(b.placeId))
    const entry = entries[0]
    if (!entry) throw new Error('Empty supplementary Address group.')
    if (
      entries.some(
        other =>
          JSON.stringify(other.values) !== JSON.stringify(entry.values) ||
          other.baseAddressId !== entry.baseAddressId,
      )
    ) {
      throw new Error(
        `Shared supplementary Address ${id} has conflicting structured values or ALS derivation; curate before retrying.`,
      )
    }
    const base = entry.baseAddressId
      ? input.officialAddresses.get(entry.baseAddressId)
      : undefined
    if (entry.baseAddressId && !base)
      throw new Error(`Supplementary ALS base ${entry.baseAddressId} is missing.`)
    const divisions = Object.fromEntries(
      ADDRESS_DIVISION_FIELDS.map(field => [field, base?.[field] ?? null]),
    ) as Record<(typeof ADDRESS_DIVISION_FIELDS)[number], string | null>
    const attribution: SourceAttribution[] = entries.map(accepted => ({
      publisher: 'overture',
      dataset: input.datasetCode,
      recordId: accepted.placeId,
    }))
    const canonical = {
      id,
      parentAddressId: null,
      granularity: establishAddressGranularity({
        addressId: id,
        values: entry.values,
        sourceVersion: input.sourceVersion,
      }).granularity,
      ...divisions,
      streetId: null,
      geometry: null,
      sources: attribution,
      // Identity-generation inputs remain in the Place curation ledger.
      identifiers: null,
    }
    const i18n = entry.values.map(({ provenance: _provenance, ...value }) => ({
      ...value,
      addressId: id,
    }))
    const versionHash = await createHash(canonical)
    const i18nVersionHashes = Object.fromEntries(
      await Promise.all(
        i18n.map(async value => [value.locale, await createHash(value)]),
      ),
    ) as Record<string, string>
    const lookups = await Promise.all(
      buildAddressBuildingNumberLookupRows(i18n).map(async lookup => ({
        ...lookup,
        versionHash: await createHash(lookup),
      })),
    )
    rows.push({
      canonical,
      versionHash,
      i18nVersionHashes,
      lookups,
      current: {
        ...canonical,
        scopeId: input.snapshotId,
        divisionSnapshotId: base?.divisionSnapshotId ?? input.divisionSnapshotId,
        streetSnapshotId: null,
      },
      i18n,
    })
  }
  return rows
}

export async function assertSupplementaryAddressRows(
  db: HarbourReadableDb,
  snapshotId: string,
  expected: Awaited<ReturnType<typeof buildSupplementaryAddressRows>>,
) {
  const rows = await db
    .select()
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.scopeId, snapshotId))
    .all()
  const localisations = await db
    .select()
    .from(currentSchema.address2dI18n)
    .where(eq(currentSchema.address2dI18n.scopeId, snapshotId))
    .all()
  if (
    rows.length !== expected.length ||
    localisations.length !== expected.reduce((count, row) => count + row.i18n.length, 0)
  ) {
    throw new Error(
      'Supplementary snapshot is missing materialised Address rows or localisations.',
    )
  }
  const byId = new Map(rows.map(row => [row.id, row]))
  const byLocale = new Map(
    localisations.map(row => [`${row.addressId}:${row.locale}`, row]),
  )
  for (const row of expected) {
    for (const [actual, wanted] of [
      [byId.get(row.current.id), row.current],
      ...row.i18n.map(
        value => [byLocale.get(`${value.addressId}:${value.locale}`), value] as const,
      ),
    ] as const) {
      if (
        !actual ||
        (await createHash(
          Object.fromEntries(
            Object.keys(wanted).map(key => [
              key,
              key === 'scopeId'
                ? row.current.scopeId
                : (actual as Record<string, unknown>)[key],
            ]),
          ),
        )) !== (await createHash(wanted))
      ) {
        throw new Error(
          `Supplementary Address ${row.current.id} cannot be reproduced from its materialised row.`,
        )
      }
    }
  }
}
