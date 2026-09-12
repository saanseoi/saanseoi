import type {
  ApiReleaseSetMetadataDelta,
  SnapshotMetadataDelta,
} from '@repo/core/pipeline/harbourClient'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils.ts'
import {
  and,
  eq,
  inArray,
  metaApiComposition,
  metaApiReleaseSets,
  metaApiVersions,
  metaPublisherI18n,
  metaPublishers,
  metaSnapshots,
} from '@repo/db'
import { ControlRequestError } from './controlRequests.ts'

export function publishMetadataDelta(
  releaseId: string | null,
  apiReleaseSet?: ApiReleaseSetMetadataDelta,
  snapshots?: SnapshotMetadataDelta[],
) {
  return {
    ...(apiReleaseSet
      ? {
          apiReleaseSets: [apiReleaseSet],
        }
      : {}),
    releases: releaseId ? [{ id: releaseId, status: 'published' as const }] : [],
    ...(snapshots && snapshots.length > 0 ? { snapshots } : {}),
  }
}

export async function resolvePublishedSnapshotMetadataDeltas(
  db: HarbourReadableDb,
  snapshotIds: string[],
): Promise<SnapshotMetadataDelta[]> {
  if (snapshotIds.length === 0) return []

  const snapshots = (
    await Promise.all(
      chunkArray(snapshotIds, getMaxItemsPerInClause()).map(ids =>
        db
          .select({
            id: metaSnapshots.id,
            publishedAt: metaSnapshots.publishedAt,
            status: metaSnapshots.status,
            validFrom: metaSnapshots.validFrom,
            validTo: metaSnapshots.validTo,
          })
          .from(metaSnapshots)
          .where(inArray(metaSnapshots.id, ids))
          .all(),
      ),
    )
  ).flat()

  if (snapshots.length !== snapshotIds.length) {
    throw new ControlRequestError('Published snapshot metadata is incomplete.')
  }

  return snapshots.map(snapshot => {
    if (
      snapshot.status !== 'published' ||
      !snapshot.publishedAt ||
      !snapshot.validFrom ||
      snapshot.validTo !== null
    ) {
      throw new ControlRequestError(
        `Snapshot ${snapshot.id} was not published with a complete validity interval.`,
      )
    }

    return {
      id: snapshot.id,
      status: 'published',
      publishedAt: snapshot.publishedAt,
      validFrom: snapshot.validFrom,
      validTo: null,
    }
  })
}

export async function resolveApiReleaseSetMetadataDelta(
  db: HarbourReadableDb,
  releaseSetId: string,
): Promise<ApiReleaseSetMetadataDelta | undefined> {
  const releaseSet = await db
    .select({
      id: metaApiReleaseSets.id,
      apiVersionId: metaApiReleaseSets.apiVersionId,
      apiCompositionId: metaApiReleaseSets.apiCompositionId,
      code: metaApiReleaseSets.code,
      regionCode: metaApiReleaseSets.regionCode,
      domainCode: metaApiReleaseSets.domainCode,
      cohortKey: metaApiReleaseSets.cohortKey,
      revision: metaApiReleaseSets.revision,
      effectiveFrom: metaApiReleaseSets.effectiveFrom,
      effectiveTo: metaApiReleaseSets.effectiveTo,
      supersedesApiReleaseSetId: metaApiReleaseSets.supersedesApiReleaseSetId,
      schemaVersion: metaApiReleaseSets.schemaVersion,
      rulesetVersion: metaApiReleaseSets.rulesetVersion,
      status: metaApiReleaseSets.status,
      publishedAt: metaApiReleaseSets.publishedAt,
      validFrom: metaApiReleaseSets.validFrom,
      validTo: metaApiReleaseSets.validTo,
      notes: metaApiReleaseSets.notes,
      guide: metaApiReleaseSets.guide,
      versionHash: metaApiReleaseSets.versionHash,
      createdAt: metaApiReleaseSets.createdAt,
      updatedAt: metaApiReleaseSets.updatedAt,
    })
    .from(metaApiReleaseSets)
    .where(eq(metaApiReleaseSets.id, releaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) return undefined
  const status = releaseSet.status
  if (status !== 'current' && status !== 'draft' && status !== 'archived') {
    throw new ControlRequestError(
      `Cannot include API release set ${releaseSetId} with invalid status ${status} in publish metadata delta.`,
    )
  }

  return { ...releaseSet, status }
}

export async function resolvePublisherName(
  db: HarbourReadableDb,
  publisherCode: string,
) {
  const publisher = await db
    .select({ name: metaPublisherI18n.name })
    .from(metaPublisherI18n)
    .innerJoin(metaPublishers, eq(metaPublisherI18n.publisherId, metaPublishers.id))
    .where(
      and(eq(metaPublishers.code, publisherCode), eq(metaPublisherI18n.locale, 'en')),
    )
    .limit(1)
    .get()

  return publisher?.name ?? publisherCode
}

export async function requireReleaseSetPublicationMetadata(
  db: HarbourReadableDb,
  releaseSetId: string,
  fallback: {
    apiFamily: string
    cohortKey: string
    domainCode: string
    regionCode: string
  },
) {
  const releaseSet = await db
    .select({
      apiFamily: metaApiVersions.familyType,
      apiVersionId: metaApiReleaseSets.apiVersionId,
      apiCompositionId: metaApiReleaseSets.apiCompositionId,
      cohortKey: metaApiReleaseSets.cohortKey,
      domainCode: metaApiReleaseSets.domainCode,
      regionCode: metaApiReleaseSets.regionCode,
      revision: metaApiReleaseSets.revision,
    })
    .from(metaApiReleaseSets)
    .innerJoin(metaApiVersions, eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id))
    .where(eq(metaApiReleaseSets.id, releaseSetId))
    .limit(1)
    .get()

  if (!releaseSet) {
    throw new ControlRequestError(
      `Published API release set metadata not found: ${releaseSetId}`,
    )
  }

  const composition = await db
    .select({ i18n: metaApiComposition.i18n })
    .from(metaApiComposition)
    .where(
      releaseSet.apiCompositionId
        ? eq(metaApiComposition.id, releaseSet.apiCompositionId)
        : and(
            eq(metaApiComposition.apiVersionId, releaseSet.apiVersionId),
            eq(metaApiComposition.status, 'current'),
          ),
    )
    .limit(1)
    .get()
  const domainCode = releaseSet.domainCode ?? fallback.domainCode
  const copy = getEnglishDomainCopy(composition?.i18n, domainCode)
  return {
    apiFamily: releaseSet.apiFamily ?? fallback.apiFamily,
    cohortKey: releaseSet.cohortKey ?? fallback.cohortKey,
    description: copy.description,
    domainCode,
    domainName: copy.name,
    regionCode: releaseSet.regionCode ?? fallback.regionCode,
    revision: releaseSet.revision,
  }
}

function getEnglishDomainCopy(value: unknown, domainCode: string) {
  const composition = parseCompositionI18n(value)
  const translations =
    composition && typeof composition === 'object'
      ? (composition as Record<string, unknown>)[domainCode]
      : undefined
  const english = Array.isArray(translations)
    ? translations.find(
        translation =>
          translation &&
          typeof translation === 'object' &&
          (translation as { locale?: unknown }).locale === 'en',
      )
    : undefined
  const name =
    english &&
    typeof english === 'object' &&
    typeof (english as { name?: unknown }).name === 'string'
      ? (english as { name: string }).name
      : domainCode
  const description =
    english &&
    typeof english === 'object' &&
    typeof (english as { description?: unknown }).description === 'string'
      ? (english as { description: string }).description
      : ''

  return { description, name }
}

function parseCompositionI18n(value: unknown) {
  if (typeof value !== 'string') return value

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}
