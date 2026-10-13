import type { HistoryDatabase, MetaDatabase } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '../../../lib/db/types'
import type { DatasetProcessingMessage } from '../../../types'
import {
  getAddressVersionMapForSnapshotDbs,
  insertAddressVersionRows,
  prepareAddressVersionInsertContext,
} from '../../db/address'
import { recordHistoryDeletions } from '../../db/historyDeletions'
import { recordSourceResolutions, resolvedEntities } from '../../db/sourceResolutions'
import { createHash } from '../../utils'
import type { HarbourWorkerBucket } from '../divisions/division'
import { resolveDataShardEnvironment } from '../runtime'
import { readAlsPublisherSource } from '../sources/alsSourcePayload'
import {
  buildPipelineArtefactKey,
  type PipelineArtefactBucket,
  readJsonArtefact,
  writeJsonArtefact,
} from '../storage/artefacts'
import {
  buildAddressBaseHashInput,
  buildAddressBuildingNumberLookupRows,
  buildAddressI18nHashInput,
  buildMatchKey,
  dedupeAddressI18nRows,
  dedupeNormalisedAddressRows,
  normaliseAddressI18nSnapshotRow,
} from './normalisation'
import type {
  AddressPipelineMessage,
  NormalisedAddressChunkArtefact,
  ResolvedAddressChunkArtefact,
} from './types'

export async function writeAddressHistoryChunkStage(
  metaDb: MetaDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
): Promise<AddressPipelineMessage> {
  const {
    changedI18nVersionRows,
    changedVersionRows,
    changedLookupRows,
    deletions,
    artefact,
    versionInsertContext,
  } = await buildResolvedAddressChunkArtefact(metaDb, historyDb, bucket, message)
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb

  await insertAddressVersionRows(
    historyRepoDb,
    versionInsertContext,
    changedVersionRows,
    changedI18nVersionRows,
    changedLookupRows,
  )
  for (const [recordType, changes] of deletions)
    await recordHistoryDeletions(historyRepoDb, {
      snapshotId: versionInsertContext.snapshotId,
      sourceReleaseId: versionInsertContext.resourceReleaseId,
      recordType,
      operation: 'delete',
      changes,
    })
  await recordSourceResolutions(
    historyRepoDb,
    artefact.rows.flatMap(row => (row.sourceResolution ? [row.sourceResolution] : [])),
  )

  const resolvedArtefactKey = buildPipelineArtefactKey(
    message,
    'resolved',
    artefact.rowStart,
    artefact.rowEnd,
  )

  await writeJsonArtefact<ResolvedAddressChunkArtefact>(bucket, resolvedArtefactKey, {
    ...artefact,
    rows: artefact.rows,
  })

  return {
    ...(message as AddressPipelineMessage),
    addressStage: 'current',
    resolvedArtefactKey,
  } satisfies AddressPipelineMessage
}

export async function buildResolvedAddressChunkArtefact(
  metaDb: MetaDatabase,
  historyDb: HistoryDatabase,
  bucket: HarbourWorkerBucket & PipelineArtefactBucket,
  message: DatasetProcessingMessage,
  options: {
    previousHistoryDbs?: HistoryDatabase[]
  } = {},
) {
  const pipelineMessage = message as AddressPipelineMessage

  if (!pipelineMessage.artefactKey) {
    throw new Error('Missing normalised address artefact key for history stage.')
  }

  const artefact = await readJsonArtefact<NormalisedAddressChunkArtefact>(
    bucket,
    pipelineMessage.artefactKey,
  )
  const metaRepoDb = metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const historyRepoDb = historyDb as unknown as HarbourReadableDb & HarbourWritableDb
  const versionInsertContext = await prepareAddressVersionInsertContext(
    metaRepoDb,
    message,
    resolveDataShardEnvironment(process.env.DATA_SHARD_ENV),
  )
  const normalisedRows = dedupeNormalisedAddressRows(artefact.rows)
  const prior = await getAddressVersionMapForSnapshotDbs(
    metaRepoDb,
    [
      ...new Set([historyRepoDb, ...(options.previousHistoryDbs ?? [])]),
    ] as HarbourReadableDb[],
    versionInsertContext.parentSnapshotId,
    { buildAddressBaseHashInput, buildMatchKey, normaliseAddressI18nSnapshotRow },
  )
  const currentAddressLookup = {
    byId: prior,
    byMatchKey: new Map(
      [...prior.values()].filter(row => row.matchKey).map(row => [row.matchKey!, row]),
    ),
  }
  const changedExistingIds = new Set<string>()
  const changedVersionRows: Parameters<typeof insertAddressVersionRows>[2] = []
  const changedI18nVersionRows: Parameters<typeof insertAddressVersionRows>[3] = []
  const changedLookupRows: NonNullable<Parameters<typeof insertAddressVersionRows>[4]> =
    []
  const deletions = new Map<string, Array<{ recordId: string; locale?: string }>>()
  const omit = (type: string, recordId: string, locale?: string) =>
    deletions.set(type, [...(deletions.get(type) ?? []), { recordId, locale }])
  const resolvedRowsByAddressId = new Map<
    string,
    ResolvedAddressChunkArtefact['rows'][number]
  >()

  for (const row of normalisedRows) {
    const matchedCurrent =
      currentAddressLookup.byId.get(row.canonicalId) ??
      // ALS preparation already resolves source premise identities and reviewed aliases.
      // A shared street address must never replace that identity or merge its owners.
      (message.source !== 'hkgov-dpo' && !row.raw.hierarchyCuration && row.matchKey
        ? currentAddressLookup.byMatchKey.get(row.matchKey)
        : null) ??
      null
    const addressId = matchedCurrent?.id ?? row.canonicalId
    const now = artefact.processingRunStartedAt
    const base = {
      ...row.base,
      id: addressId,
      snapshotId: versionInsertContext.snapshotId,
      createdAt: now,
      updatedAt: now,
    }
    const i18n = dedupeAddressI18nRows(
      row.i18n.map(localised => ({
        ...localised,
        addressId,
        snapshotId: versionInsertContext.snapshotId,
        createdAt: now,
        updatedAt: now,
      })),
      addressId,
    )
    const versionHash = await createHash({
      base: buildAddressBaseHashInput(base),
      i18n: i18n
        .map(buildAddressI18nHashInput)
        .sort((left, right) => left.locale.localeCompare(right.locale)),
    })
    const changed = matchedCurrent?.churnHash !== versionHash
    const publisherSource = readAlsPublisherSource(row.raw)

    resolvedRowsByAddressId.set(addressId, {
      ...(publisherSource
        ? {
            sourceResolution: {
              snapshotId: versionInsertContext.snapshotId,
              sourceReleaseId: versionInsertContext.resourceReleaseId,
              sourceRecordId: publisherSource.sourceRecordId,
              sourceVersionHash: publisherSource.versionHash,
              resolutions: {
                entities: resolvedEntities({
                  address2d: addressId,
                  district: base.districtId,
                  landform: base.landformId,
                  area: base.areaId,
                  country: base.countryId,
                  parentAddress: base.parentAddressId,
                }),
                ...(typeof row.raw.identityMatchMethod === 'string'
                  ? { methods: { identity: row.raw.identityMatchMethod } }
                  : {}),
              },
            },
          }
        : {}),
      addressId,
      base,
      changed,
      changedExistingId: changed ? (matchedCurrent?.id ?? null) : null,
      coverageComponents: row.coverageComponents,
      i18n,
      sourceId: row.sourceId,
      versionHash: await createHash(buildAddressBaseHashInput(base)),
    })
  }

  const resolvedRows = [...resolvedRowsByAddressId.values()]
  let insertedVersions = 0
  let addedRows = 0
  let changedRows = 0
  let unchangedRows = 0
  let localisedRows = 0

  for (const row of resolvedRows) {
    localisedRows += row.i18n.length

    if (!row.changed) {
      unchangedRows += 1
      continue
    }

    if (row.changedExistingId) {
      changedExistingIds.add(row.changedExistingId)
      changedRows += 1
    } else {
      addedRows += 1
    }

    insertedVersions += 1
    const previous = prior.get(row.addressId)
    const baseHash = await createHash(buildAddressBaseHashInput(row.base))
    if (previous?.versionHash !== baseHash)
      changedVersionRows.push({ ...row.base, versionHash: baseHash })
    const changedLocales = []
    for (const localised of row.i18n) {
      const hash = await createHash(buildAddressI18nHashInput(localised))
      const before = previous?.localisedRows.find(
        value => value.locale === localised.locale,
      )
      if (!before || (await createHash(buildAddressI18nHashInput(before))) !== hash)
        changedLocales.push({ ...localised, componentHash: hash })
    }
    for (const before of previous?.localisedRows ?? [])
      if (!row.i18n.some(value => value.locale === before.locale))
        omit('address2dI18n', row.addressId, before.locale)
    const oldLookups = new Map(
      buildAddressBuildingNumberLookupRows(previous?.localisedRows ?? []).map(value => [
        value.buildingNumber,
        value,
      ]),
    )
    const nextLookups = buildAddressBuildingNumberLookupRows(row.i18n)
    for (const lookup of nextLookups) {
      const hash = await createHash(lookup)
      const before = oldLookups.get(lookup.buildingNumber)
      if (!before || (await createHash(before)) !== hash)
        changedLookupRows.push({
          ...lookup,
          versionHash: hash,
          snapshotId: versionInsertContext.snapshotId,
          sourceReleaseId: versionInsertContext.resourceReleaseId,
          isCurrent: true,
          createdAt: row.base.createdAt!,
          updatedAt: row.base.updatedAt!,
        })
    }
    for (const before of oldLookups.values())
      if (!nextLookups.some(value => value.buildingNumber === before.buildingNumber))
        omit(
          'address2dBuildingNumberLookup',
          JSON.stringify([row.addressId, before.buildingNumber]),
        )
    changedI18nVersionRows.push(
      ...changedLocales.map(localised => ({
        addressId: localised.addressId,
        locale: localised.locale,
        formattedAddress: localised.formattedAddress,
        buildingName: localised.buildingName ?? null,
        buildingNumberExpression: localised.buildingNumberExpression ?? null,
        buildingNumberFrom: localised.buildingNumberFrom ?? null,
        buildingNumberTo: localised.buildingNumberTo ?? null,
        buildingNumberConnector: localised.buildingNumberConnector ?? null,
        blockExpression: localised.blockExpression ?? null,
        blockType: localised.blockType ?? null,
        blockRef: localised.blockRef ?? null,
        blockTypeBeforeNumber: localised.blockTypeBeforeNumber ?? null,
        phaseExpression: localised.phaseExpression ?? null,
        phaseName: localised.phaseName ?? null,
        phaseRef: localised.phaseRef ?? null,
        estateName: localised.estateName ?? null,
        streetName: localised.streetName ?? null,
        sourceReleaseId: versionInsertContext.resourceReleaseId,
        snapshotId: localised.snapshotId ?? row.base.snapshotId,
        isCurrent: true,
        versionHash: localised.componentHash,
        createdAt: localised.createdAt ?? row.base.createdAt,
        updatedAt: localised.updatedAt ?? row.base.updatedAt,
      })),
    )
  }

  return {
    changedLookupRows,
    deletions,
    changedExistingIds,
    changedI18nVersionRows,
    changedVersionRows,
    versionInsertContext,
    artefact: {
      addedRows,
      changedRows,
      kind: 'address.resolved.v1',
      insertedVersions,
      localisedRows,
      processingRunStartedAt: artefact.processingRunStartedAt,
      resourceReleaseId: artefact.resourceReleaseId,
      rowStart: artefact.rowStart,
      rowEnd: artefact.rowEnd,
      rows: resolvedRows,
      totalRows: artefact.totalRows,
      unchangedRows,
    } satisfies ResolvedAddressChunkArtefact,
  }
}

function _buildCurrentAddressLookupFromCache(
  cache: NonNullable<AddressPipelineMessage['addressCurrentLookupCache']>,
) {
  return {
    byId: cache.byId,
    byMatchKey: cache.byMatchKey,
  }
}
