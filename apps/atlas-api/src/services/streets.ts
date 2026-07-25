import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  StreetEvidenceAsset,
  StreetEvidenceAssetRole,
} from '@repo/db'
import {
  and,
  desc,
  eq,
  historySchema,
  metaDatasets,
  metaSnapshotSources,
  metaSnapshots,
  streetEvidenceAssetRoles,
} from '@repo/db'

import { getStreetCurrentById } from '../db/streets'
import type { StreetAsset, StreetLocale, StreetResource } from '../schema'

type StoredStreetLocale = Omit<StreetLocale, 'assetLinks' | 'translationProvenance'> & {
  assetLinks: unknown
  locale: string
  translationProvenance: unknown
}

type StreetState = Omit<
  StreetResource['attributes'],
  'districtIds' | 'i18n' | 'provenance'
> & {
  districtIds: unknown
  id: StreetResource['id']
  i18n: StoredStreetLocale[]
  references: unknown
}

export async function getHongKongStreetDetail(input: {
  currentDb: CurrentDatabase
  id: string
  metaDb: MetaDatabase
  requestUrl: string
}) {
  const snapshot = await getPublishedStreetSnapshot(input.metaDb)
  if (!snapshot) return snapshotNotReady()
  const street = await getStreetCurrentById(input.currentDb, {
    id: input.id,
    snapshotId: snapshot.id,
  })
  if (!street) return streetNotFound()
  return {
    status: 200 as const,
    body: detailDocument(
      asStreetState(street),
      input.requestUrl,
      linksForStreet(input.requestUrl, input.id, street.version),
    ),
  }
}

export async function listHongKongStreetVersions(input: {
  historyDbs: HistoryDatabase[]
  id: string
  metaDb: MetaDatabase
  requestUrl: string
}) {
  const snapshot = await getPublishedStreetSnapshot(input.metaDb)
  if (!snapshot) return snapshotNotReady()
  const versions = await getStreetHistory(input.historyDbs, input.id)
  if (versions.length === 0) return streetNotFound()
  const data = versions.map((state, index) =>
    resource(
      state,
      linksForStreet(
        versionUrl(input.requestUrl, input.id, state.version),
        input.id,
        state.version,
        {
          next: versions[index + 1]?.version,
          previous: versions[index - 1]?.version,
        },
      ),
    ),
  )
  return {
    status: 200 as const,
    body: {
      jsonapi: { version: '1.1' as const },
      links: {
        self: input.requestUrl,
        version: versionUrl(input.requestUrl, input.id, versions.at(-1)?.version ?? 1),
        versions: input.requestUrl,
      },
      data,
    },
  }
}

export async function getHongKongStreetVersion(input: {
  historyDbs: HistoryDatabase[]
  id: string
  metaDb: MetaDatabase
  requestUrl: string
  version: number
}) {
  const snapshot = await getPublishedStreetSnapshot(input.metaDb)
  if (!snapshot) return snapshotNotReady()
  const versions = await getStreetHistory(input.historyDbs, input.id)
  const index = versions.findIndex(item => item.version === input.version)
  if (index < 0) return streetNotFound()
  const state = versions[index]
  if (!state) return streetNotFound()
  return {
    status: 200 as const,
    body: detailDocument(
      state,
      input.requestUrl,
      linksForStreet(input.requestUrl, input.id, state.version, {
        next: versions[index + 1]?.version,
        previous: versions[index - 1]?.version,
      }),
    ),
  }
}

async function getPublishedStreetSnapshot(metaDb: MetaDatabase) {
  return metaDb
    .select({ id: metaSnapshots.id })
    .from(metaSnapshots)
    .innerJoin(
      metaSnapshotSources,
      eq(metaSnapshots.id, metaSnapshotSources.snapshotId),
    )
    .innerJoin(metaDatasets, eq(metaSnapshotSources.datasetId, metaDatasets.id))
    .where(
      and(
        eq(metaSnapshots.resourceType, 'street'),
        eq(metaSnapshots.status, 'published'),
        eq(metaDatasets.regionCode, 'hk'),
        eq(metaSnapshotSources.role, 'primary'),
      ),
    )
    .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
    .limit(1)
    .get()
}

async function getStreetHistory(historyDbs: HistoryDatabase[], id: string) {
  const records = await Promise.all(
    historyDbs.map(async db => {
      const streets = await db
        .select({
          deletedAt: historySchema.streets.deletedAt,
          districtIds: historySchema.streets.districtIds,
          id: historySchema.streets.id,
          landsdPublicationDate: historySchema.streets.landsdPublicationDate,
          references: historySchema.streets.references,
          status: historySchema.streets.status,
          version: historySchema.streets.version,
          versionHash: historySchema.streets.versionHash,
        })
        .from(historySchema.streets)
        .where(eq(historySchema.streets.id, id))
        .all()
      if (streets.length === 0) return []
      const i18n = await db
        .select({
          assetLinks: historySchema.streetsI18n.assetLinks,
          description: historySchema.streetsI18n.description,
          locale: historySchema.streetsI18n.locale,
          name: historySchema.streetsI18n.name,
          streetId: historySchema.streetsI18n.streetId,
          translationProvenance: historySchema.streetsI18n.translationProvenance,
          versionHash: historySchema.streetsI18n.versionHash,
        })
        .from(historySchema.streetsI18n)
        .where(eq(historySchema.streetsI18n.streetId, id))
        .all()
      return streets.map(street => ({
        ...street,
        i18n: i18n.filter(item => item.versionHash === street.versionHash),
      }))
    }),
  )
  const byVersion = new Map<number, StreetState>()
  for (const row of records.flat()) {
    // Version numbers are logical identities. Duplicate rows across a shard
    // retry are equivalent and should not make history traversal ambiguous.
    if (!byVersion.has(row.version)) {
      byVersion.set(row.version, {
        deletedAt: row.deletedAt,
        districtIds: row.districtIds,
        id: row.id,
        i18n: row.i18n,
        landsdPublicationDate: row.landsdPublicationDate,
        references: row.references,
        status: row.status === 'deleted' ? 'deleted' : 'active',
        version: row.version,
      })
    }
  }
  return [...byVersion.values()].sort((left, right) => left.version - right.version)
}

function asStreetState(street: Awaited<ReturnType<typeof getStreetCurrentById>>) {
  if (!street) throw new Error('Cannot serialize an absent street.')
  return {
    deletedAt: street.deletedAt,
    districtIds: street.districtIds,
    id: street.id,
    i18n: street.i18n,
    landsdPublicationDate: street.landsdPublicationDate,
    references: street.references,
    status: street.status,
    version: street.version,
  } satisfies StreetState
}

function detailDocument(
  state: StreetState,
  requestUrl: string,
  links: Record<string, string>,
) {
  return {
    jsonapi: { version: '1.1' as const },
    links: { self: requestUrl, ...links },
    data: resource(state, links),
  }
}

function resource(state: StreetState, links: Record<string, string>) {
  return {
    type: 'streets' as const,
    id: state.id,
    attributes: {
      deletedAt: state.deletedAt,
      districtIds: stringArray(state.districtIds),
      i18n: locales(state),
      landsdPublicationDate: state.landsdPublicationDate,
      provenance: publicProvenance(state.references),
      status: state.status,
      version: state.version,
    },
    links,
  }
}

function locales(street: StreetState) {
  const i18nByLocale = new Map(street.i18n.map(row => [row.locale, row] as const))
  const localeCodes = ['en', 'zh-Hant', 'zh-Hans'] as const
  return Object.fromEntries(
    localeCodes.map(locale => {
      const row = i18nByLocale.get(locale)
      if (!row)
        throw new Error(
          `Street ${street.id} is missing required ${locale} localization.`,
        )
      return [
        locale,
        {
          assetLinks: publicAssetLinks(row.assetLinks),
          description: row.description,
          name: row.name,
          translationProvenance: row.translationProvenance ?? null,
        } satisfies StreetLocale,
      ]
    }),
  ) as Record<(typeof localeCodes)[number], StreetLocale>
}

function linksForStreet(
  requestUrl: string,
  id: string,
  version: number,
  adjacent: { next?: number; previous?: number } = {},
) {
  const versionLink = versionUrl(requestUrl, id, version)
  return {
    self: requestUrl,
    version: versionLink,
    versions: versionsUrl(requestUrl, id),
    ...(adjacent.previous
      ? { previous: versionUrl(requestUrl, id, adjacent.previous) }
      : {}),
    ...(adjacent.next ? { next: versionUrl(requestUrl, id, adjacent.next) } : {}),
  }
}

function versionsUrl(requestUrl: string, id: string) {
  return new URL(
    `/v0/hk/streets/${encodeURIComponent(id)}/versions`,
    requestUrl,
  ).toString()
}

function versionUrl(requestUrl: string, id: string, version: number) {
  return new URL(
    `/v0/hk/streets/${encodeURIComponent(id)}/versions/${version}`,
    requestUrl,
  ).toString()
}

function publicAssetLinks(value: unknown): StreetAsset[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(asset => {
    if (!asset || typeof asset !== 'object') return []
    const record = asset as Partial<StreetEvidenceAsset>
    return typeof record.assetId === 'string' &&
      typeof record.assetUrl === 'string' &&
      typeof record.contentHash === 'string' &&
      typeof record.mediaType === 'string' &&
      typeof record.originalUrl === 'string' &&
      typeof record.retrievedAt === 'string' &&
      (record.label === null ||
        record.label === undefined ||
        typeof record.label === 'string') &&
      isStreetEvidenceAssetRole(record.role)
      ? [
          {
            assetId: record.assetId,
            assetUrl: record.assetUrl,
            contentHash: record.contentHash,
            label: record.label ?? null,
            mediaType: record.mediaType,
            originalUrl: record.originalUrl,
            retrievedAt: record.retrievedAt,
            role: record.role,
            ...(record.sourcePageLocale
              ? { sourcePageLocale: record.sourcePageLocale }
              : {}),
            ...(record.sourcePageUrl ? { sourcePageUrl: record.sourcePageUrl } : {}),
          },
        ]
      : []
  })
}

function publicProvenance(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const landsd = (value as Record<string, unknown>).hkgovLandsd
  if (!landsd || typeof landsd !== 'object' || Array.isArray(landsd)) return null
  const record = landsd as Record<string, unknown>
  return {
    effectiveDate: stringOrNull(record.effectiveDate),
    publicationDate: stringOrNull(record.publicationDate),
    sourceEventIds: stringArray(record.sourceEventIds),
  }
}

function isStreetEvidenceAssetRole(value: unknown): value is StreetEvidenceAssetRole {
  return (
    typeof value === 'string' &&
    streetEvidenceAssetRoles.includes(value as StreetEvidenceAssetRole)
  )
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' ? value : null
}

function snapshotNotReady() {
  return {
    status: 503 as const,
    body: {
      httpStatus: 503 as const,
      error: 'snapshot_not_ready' as const,
      message: 'No active street snapshot is published.',
    },
  }
}

function streetNotFound() {
  return {
    status: 404 as const,
    body: {
      httpStatus: 404 as const,
      error: 'not_found' as const,
      message: 'Street not found.',
    },
  }
}
