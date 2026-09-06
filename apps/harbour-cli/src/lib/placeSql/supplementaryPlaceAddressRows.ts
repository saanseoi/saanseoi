import { createHash } from '@repo/core/pipeline/utils'
import { establishAddressGranularity } from '@repo/core/pipeline/services/addressPipeline/granularity'
import type { currentSchema } from '@repo/db'
import type {
  StagedAddressResolution,
  SupplementaryEntry,
} from './supplementaryPlaceAddress.ts'

export const SUPPLEMENTARY_ADDRESS_VARIANT = 'overture-places'
export const ADDRESS_DIVISION_FIELDS = [
  'countryId',
  'areaId',
  'districtId',
  'townId',
  'macrohoodId',
  'villageId',
  'neighbourhoodId',
  'hamletId',
  'microhoodId',
] as const
type Address = typeof currentSchema.address2d.$inferSelect
type AddressDivisionReference = Pick<
  Address,
  | 'areaId'
  | 'countryId'
  | 'districtId'
  | 'divisionSnapshotId'
  | 'hamletId'
  | 'id'
  | 'macrohoodId'
  | 'microhoodId'
  | 'neighbourhoodId'
  | 'snapshotId'
  | 'townId'
  | 'villageId'
>

/** Produces complete snapshot rows from durable curation, never a fresh text parse. */
export async function buildSupplementaryAddressRows(input: {
  resolutions: StagedAddressResolution[]
  officialAddresses: Map<string, AddressDivisionReference>
  snapshotId: string
  divisionSnapshotId: string
  sourceReleaseId: string
  placeSourceReleaseId: string
  sourceVersion: string
  datasetId: string
}) {
  const groups = new Map<string, SupplementaryEntry[]>()
  const observations = new Map(
    input.resolutions.map(resolution => [resolution.placeId, resolution]),
  )
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
    const sources = entries.map(accepted => ({
      source: 'overture-place-address',
      datasetId: input.datasetId,
      sourceRecordId: accepted.placeId,
      sourceReleaseId: input.sourceReleaseId,
      placeSourceReleaseId: input.placeSourceReleaseId,
      sourceVersion: input.sourceVersion,
      publisherAddress: observations.get(accepted.placeId)?.sourceTexts,
      publisherAddressFingerprint: observations.get(accepted.placeId)?.fingerprint,
      curationEntry: {
        placeId: accepted.placeId,
        identityKey: accepted.identityKey,
        firstAcceptedSourceRelease: accepted.firstAcceptedSourceRelease,
        acceptanceMode: accepted.acceptanceMode,
      },
      policyVersion: accepted.policyVersion,
      localisationProvenance: Object.fromEntries(
        accepted.values
          .filter(value => value.provenance)
          .map(value => [value.locale, value.provenance]),
      ),
      score: accepted.score,
      evidence:
        accepted.evidence.find(
          candidate => candidate.addressId === accepted.baseAddressId,
        ) ?? null,
      selectedAlsBase: base
        ? {
            snapshotId: base.snapshotId,
            addressId: base.id,
            divisionSnapshotId: base.divisionSnapshotId,
            divisions,
          }
        : null,
    }))
    const canonical = {
      id,
      parentAddressId: null,
      ...establishAddressGranularity({
        addressId: id,
        values: entry.values,
        sourceVersion: input.sourceVersion,
      }),
      ...divisions,
      streetId: null,
      geometry: null,
      bbox: null,
      identifiers: { supplementaryIdentityKey: entry.identityKey },
      sources,
    }
    const versionHash = await createHash({ canonical, values: entry.values })
    rows.push({
      canonical,
      versionHash,
      current: {
        ...canonical,
        snapshotId: input.snapshotId,
        divisionSnapshotId: base?.divisionSnapshotId ?? input.divisionSnapshotId,
        streetSnapshotId: null,
      },
      i18n: entry.values.map(({ provenance: _provenance, ...value }) => ({
        ...value,
        addressId: id,
      })),
    })
  }
  return rows
}
