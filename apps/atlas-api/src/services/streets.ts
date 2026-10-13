import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  groupResolvedVersionsByShard,
  historyVersionSelection,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import { chunkArray } from '@repo/core/pipeline/utils.ts'
import type {
  CurrentDatabase,
  HistoryDatabase,
  MetaDatabase,
  StreetEvidenceAsset,
  StreetEvidenceAssetRole,
} from '@repo/db'
import {
  and,
  type currentSchema,
  desc,
  eq,
  type HistoryContent,
  historySchema,
  isStreetChangelogKind,
  metaDatasets,
  metaSnapshotLineages,
  metaSnapshots,
  streetEvidenceAssetRoles,
  streetLocaleCodes,
} from '@repo/db'
import { metaSnapshotResourceReleaseDetails } from '@repo/db/metaSchema'
import { getPublicationReadiness, guardPublicationRead } from '../db/publicationState'
import { getStreetCurrentById } from '../db/streets'
import {
  geographicFilterContext,
  matchesGeographicMembership,
} from '../lib/geographicFilterContext'
import type {
  StreetAsset,
  StreetChangelogEntry,
  StreetLocale,
  StreetResource,
} from '../schema'
import { type ApiRegion, resolveDataRegion } from '../schema/region'

type StoredStreetLocale = StreetLocale & {
  locale: string
}

type StreetState = Omit<
  StreetResource['attributes'],
  'districtIds' | 'i18n' | 'evidence'
> & {
  districtIds: unknown
  id: StreetResource['id']
  changelog: StreetChangelogEntry[]
  i18n: StoredStreetLocale[]
}

type StreetReplayRef =
  import('@repo/core/pipeline/db/snapshotReplay.ts').ResolvedSnapshotVersion

export async function getHongKongStreetDetail(input: {
  currentDb: CurrentDatabase
  id: string
  metaDb: MetaDatabase
  requestUrl: string
  region?: ApiRegion
}) {
  const snapshot = await getPublishedStreetSnapshot(input.metaDb, input.region)
  if (!snapshot) return snapshotNotReady()
  const token = await getPublicationReadiness(input.currentDb, 'street', [snapshot.id])
  if (token === null) return snapshotNotReady()
  return (
    (await guardPublicationRead(
      input.currentDb,
      'street',
      [snapshot.id],
      token,
      async () => {
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
      },
    )) ?? snapshotNotReady()
  )
}

export async function listHongKongStreetVersions(input: {
  historyDbsByBinding: Record<string, HistoryDatabase>
  id: string
  metaDb: MetaDatabase
  requestUrl: string
  region?: ApiRegion
}) {
  const snapshot = await getPublishedStreetSnapshot(input.metaDb, input.region)
  if (!snapshot) return snapshotNotReady()
  const versions = await getStreetHistory(
    input.historyDbsByBinding,
    input.id,
    input.metaDb,
    snapshot.id,
  )
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
      data,
      links: {
        self: input.requestUrl,
        version: versionUrl(input.requestUrl, input.id, versions.at(-1)?.version ?? 1),
        versions: input.requestUrl,
      },
    },
  }
}

export async function getHongKongStreetVersion(input: {
  historyDbsByBinding: Record<string, HistoryDatabase>
  id: string
  metaDb: MetaDatabase
  requestUrl: string
  version: number
  region?: ApiRegion
}) {
  const snapshot = await getPublishedStreetSnapshot(input.metaDb, input.region)
  if (!snapshot) return snapshotNotReady()
  const versions = await getStreetHistory(
    input.historyDbsByBinding,
    input.id,
    input.metaDb,
    snapshot.id,
  )
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

export async function replayHongKongStreetChangelog(input: {
  historyDbsByBinding: Record<string, HistoryDatabase>
  metaDb: MetaDatabase
  requestUrl: string
  region?: ApiRegion
}) {
  const snapshot = await getPublishedStreetSnapshot(input.metaDb, input.region)
  if (!snapshot) return snapshotNotReady()
  const refs = await loadSnapshotStreetVersionRefs(
    input.historyDbsByBinding,
    input.metaDb,
    snapshot.id,
    geographicFilterContext() ? ['streetChangelog', 'street'] : ['streetChangelog'],
  )
  const rows = await loadStreetChangelogRows(
    refs.filter(ref => ref.recordType === 'streetChangelog'),
  )
  const allowed = geographicFilterContext()
    ? new Set(
        (await loadStreetRows(refs.filter(ref => ref.recordType === 'street')))
          .filter(row => matchesGeographicMembership(stringArray(row.districtIds)))
          .map(row => row.id),
      )
    : null
  const seen = new Set<string>()
  const data = rows
    .flat()
    .sort((left, right) =>
      `${left.gazetteDate ?? ''}\0${left.recordKey}\0${left.streetId}`.localeCompare(
        `${right.gazetteDate ?? ''}\0${right.recordKey}\0${right.streetId}`,
      ),
    )
    .flatMap(row => {
      if (allowed && !allowed.has(row.streetId)) return []
      const id = `${row.recordKey}:${row.streetId}`
      if (seen.has(id)) return []
      seen.add(id)
      return [
        {
          type: 'street-changelog' as const,
          id,
          attributes: publicChangelogEntry(row),
        },
      ]
    })
  return {
    status: 200 as const,
    body: {
      jsonapi: { version: '1.1' as const },
      data,
      links: { self: input.requestUrl },
    },
  }
}

async function getPublishedStreetSnapshot(metaDb: MetaDatabase, region?: ApiRegion) {
  return metaDb
    .select({ id: metaSnapshots.id })
    .from(metaSnapshots)
    .innerJoin(
      metaSnapshotLineages,
      eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
    )
    .innerJoin(
      metaSnapshotResourceReleaseDetails,
      eq(metaSnapshots.id, metaSnapshotResourceReleaseDetails.snapshotId),
    )
    .innerJoin(
      metaDatasets,
      eq(metaSnapshotResourceReleaseDetails.datasetId, metaDatasets.id),
    )
    .where(
      and(
        eq(metaSnapshotLineages.resourceType, 'street'),
        eq(metaSnapshots.status, 'published'),
        eq(metaDatasets.regionCode, resolveDataRegion(region)),
        eq(metaSnapshotResourceReleaseDetails.role, 'primary'),
      ),
    )
    .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
    .limit(1)
    .get()
}

export async function getStreetHistory(
  historyDbsByBinding: Record<string, HistoryDatabase>,
  id: string,
  metaDb: MetaDatabase,
  snapshotId: string,
) {
  const plan = await resolveSnapshotReplayPlan(metaDb as never, snapshotId)
  const byVersion = new Map<number, StreetState>()
  for (const step of plan) {
    const refs = await loadSnapshotStreetVersionRefs(
      historyDbsByBinding,
      metaDb,
      step.snapshotId,
      ['street', 'streetI18n', 'streetChangelog'],
    )
    const [streets, i18n, changelog] = await Promise.all([
      loadStreetRows(
        refs.filter(ref => ref.recordType === 'street' && ref.recordId === id),
      ),
      loadStreetI18nRows(
        refs.filter(ref => ref.recordType === 'streetI18n' && ref.recordId === id),
      ),
      loadStreetChangelogRows(refs.filter(ref => ref.recordType === 'streetChangelog')),
    ])
    const changes = changelog.filter(row => row.streetId === id)
    if (!streets.length) {
      for (const assignment of step.shards) {
        const db = historyDbsByBinding[assignment.bindingName]
        if (!db) continue
        const deletion = await db
          .select()
          .from(historySchema.streets)
          .where(
            and(
              eq(historySchema.streets.id, id),
              eq(historySchema.streets.snapshotId, step.snapshotId),
              eq(historySchema.streets.operation, 'delete'),
            ),
          )
          .get()
        if (!deletion) continue
        if (deletion.version === null)
          throw new Error(`Street deletion ${id} lacks its lifecycle version.`)
        const names = await db
          .select()
          .from(historySchema.streetsI18n)
          .where(
            and(
              eq(historySchema.streetsI18n.streetId, id),
              eq(historySchema.streetsI18n.snapshotId, step.snapshotId),
              eq(historySchema.streetsI18n.operation, 'delete'),
            ),
          )
          .all()
        byVersion.set(deletion.version, {
          id,
          status: 'deleted',
          version: deletion.version,
          deletedAt: deletion.deletedAt,
          gazetteDate: deletion.gazetteDate,
          districtIds: deletion.districtIds,
          i18n: names
            .filter(name => name.name !== null)
            .map(name => ({
              locale: name.locale,
              name: name.name!,
              description: name.description,
            })),
          changelog: changes.map(publicChangelogEntry),
        })
      }
    }
    for (const street of streets) {
      if (!matchesGeographicMembership(stringArray(street.districtIds))) continue
      byVersion.set(street.version, {
        changelog: changelog
          .filter(row => row.streetId === id)
          .map(publicChangelogEntry),
        deletedAt: street.deletedAt,
        districtIds: street.districtIds,
        id: street.id,
        i18n: i18n.map(item => ({
          description: item.description,
          locale: item.locale,
          name: item.name,
        })),
        gazetteDate: street.gazetteDate,
        status: 'active',
        version: street.version,
      })
    }
  }
  return [...byVersion.values()].sort((left, right) => left.version - right.version)
}

async function loadSnapshotStreetVersionRefs(
  historyDbsByBinding: Record<string, HistoryDatabase>,
  metaDb: MetaDatabase,
  snapshotId: string,
  recordTypes: readonly string[],
) {
  const shards = new Map(
    Object.entries(historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db },
    ]),
  )
  const plan = await resolveSnapshotReplayPlan(metaDb as never, snapshotId)
  return [
    ...(await resolveSnapshotVersionState(plan, shards as never, recordTypes)).values(),
  ] as StreetReplayRef[]
}

async function loadStreetRows(refs: StreetReplayRef[]) {
  type Content = HistoryContent<
    typeof historySchema.streets.$inferSelect,
    typeof currentSchema.streets.$inferSelect
  >
  const rows: Content[] = []
  for (const shardRefs of groupResolvedVersionsByShard(refs as never).values()) {
    const first = shardRefs[0]
    if (!first) continue
    for (const batch of chunkArray(shardRefs, 256)) {
      rows.push(
        ...((await first.shard.db
          .select()
          .from(historySchema.streets)
          .where(historyVersionSelection(historySchema.streets, batch))
          .all()) as Content[]),
      )
    }
  }
  return rows
}

async function loadStreetI18nRows(refs: StreetReplayRef[]) {
  type Content = HistoryContent<
    typeof historySchema.streetsI18n.$inferSelect,
    typeof currentSchema.streetsI18n.$inferSelect
  >
  const rows: Content[] = []
  for (const shardRefs of groupResolvedVersionsByShard(refs as never).values()) {
    const first = shardRefs[0]
    if (!first) continue
    for (const batch of chunkArray(shardRefs, 256)) {
      rows.push(
        ...((await first.shard.db
          .select()
          .from(historySchema.streetsI18n)
          .where(historyVersionSelection(historySchema.streetsI18n, batch))
          .all()) as Content[]),
      )
    }
  }
  return rows
}

async function loadStreetChangelogRows(refs: StreetReplayRef[]) {
  type Content = HistoryContent<
    typeof historySchema.streetChangelog.$inferSelect,
    typeof currentSchema.streetChangelog.$inferSelect
  >
  const rows: Content[] = []
  for (const shardRefs of groupResolvedVersionsByShard(refs as never).values()) {
    const first = shardRefs[0]
    if (!first) continue
    for (const batch of chunkArray(shardRefs, 256)) {
      rows.push(
        ...((await first.shard.db
          .select()
          .from(historySchema.streetChangelog)
          .where(historyVersionSelection(historySchema.streetChangelog, batch))
          .all()) as Content[]),
      )
    }
  }
  return rows
}

function asStreetState(street: Awaited<ReturnType<typeof getStreetCurrentById>>) {
  if (!street) throw new Error('Cannot serialize an absent street.')
  return {
    changelog: street.changelog.map(publicChangelogEntry),
    deletedAt: street.deletedAt,
    districtIds: street.districtIds,
    id: street.id,
    i18n: street.i18n,
    gazetteDate: street.gazetteDate,
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
    data: resource(state, links),
    links: { self: requestUrl, ...links },
  }
}

function resource(state: StreetState, links: Record<string, string>) {
  return {
    type: 'streets' as const,
    id: state.id,
    attributes: {
      changelog: state.changelog,
      deletedAt: state.deletedAt,
      districtIds: stringArray(state.districtIds),
      i18n: locales(state),
      gazetteDate: state.gazetteDate,
      status: state.status,
      version: state.version,
    },
    links,
  }
}

function publicChangelogEntry(value: {
  evidenceAssets: unknown
  effectiveDate: string | null
  gazetteDate: string | null
  isPartialNameChange: boolean
  kind: string
  noticeRef: string | null
  recordKey: string
  sourceReleaseId: string | null
  sourceShardId: string | null
}): StreetChangelogEntry {
  return {
    evidenceAssets: publicAssetLinks(value.evidenceAssets),
    effectiveDate: value.effectiveDate,
    gazetteDate: value.gazetteDate,
    isPartialNameChange: value.isPartialNameChange,
    kind: changelogKind(value.kind),
    noticeRef: value.noticeRef,
    source: {
      recordKey: value.recordKey,
      resourceReleaseId: value.sourceReleaseId,
      shardId: value.sourceShardId,
    },
  }
}

function changelogKind(value: string): StreetChangelogEntry['kind'] {
  return isStreetChangelogKind(value) ? value : 'gazette'
}

function locales(street: StreetState) {
  const i18nByLocale = new Map(street.i18n.map(row => [row.locale, row] as const))
  return Object.fromEntries(
    streetLocaleCodes.map(locale => {
      const row = i18nByLocale.get(locale)
      if (!row)
        throw new Error(
          `Street ${street.id} is missing required ${locale} localization.`,
        )
      return [
        locale,
        {
          description: row.description,
          name: row.name,
        } satisfies StreetLocale,
      ]
    }),
  ) as Record<(typeof streetLocaleCodes)[number], StreetLocale>
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
    `${streetVersionPath(requestUrl)}/${encodeURIComponent(id)}/versions`,
    requestUrl,
  ).toString()
}

function versionUrl(requestUrl: string, id: string, version: number) {
  return new URL(
    `${streetVersionPath(requestUrl)}/${encodeURIComponent(id)}/versions/${version}`,
    requestUrl,
  ).toString()
}

function streetVersionPath(requestUrl: string) {
  const match = new URL(requestUrl).pathname.match(/^\/streets\/v0(?:\.1)?/)
  return match?.[0] ?? '/streets/v0'
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
            publisherIdentifier: record.publisherIdentifier ?? null,
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
