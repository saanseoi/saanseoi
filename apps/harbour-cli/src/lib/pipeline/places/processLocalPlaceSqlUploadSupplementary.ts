import { deliverResolvedAddressSqlPhase } from '../addresses/resolvedAddressSqlPhase.ts'
import type { PlaceRecordCache } from './placeRecordCache.ts'
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  stat,
  unlink,
} from 'node:fs/promises'
import { deferPlaceAddressReview } from './placeAddressReviewDeferral'
import { dirname, resolve } from 'node:path'
import {
  ensureDraftSnapshotForRelease,
  resolveShardForTypeRegionYear,
  recordSnapshotLookupDependency,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  publishSnapshot,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  extractPlaceAddressTexts,
  type NormalisedPlace,
} from '@repo/core/pipeline/services/places/place'
import {
  addressFingerprint,
  compactAddressResolution,
  createSupplementaryAddressAnalyser,
  emptySupplementaryEntryLedger,
  parseSupplementaryDecisionJsonLines,
  parseSupplementaryCuration,
  parseSupplementaryEntryLedger,
  type AddressResolution,
  type StagedAddressResolution,
  type SupplementaryEntryLedger,
} from './supplementaryPlaceAddress.ts'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import {
  buildSupplementaryAddressRows,
  assertSupplementaryAddressRows,
  ADDRESS_DIVISION_FIELDS,
  SUPPLEMENTARY_ADDRESS_VARIANT,
} from './supplementaryPlaceAddressRows.ts'
import { createHash } from '@repo/core/pipeline/utils'
import { parseWkbGeometry } from '@repo/core/pipeline/services/divisions/division'
import { recordPlaceAddressAssembly } from '@repo/core/pipeline/services/places/placeAddressAssembly'
import { materialiseSupplementaryAddressHistory } from './supplementaryAddressHistory.ts'
import {
  currentSchema,
  historySchema,
  metaSchema,
  buildDeterministicUuidV5,
} from '@repo/db'
import { and, eq, ne, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import { executeSqlText, type SqlImportExecutionOptions } from '../local/sqlImport.ts'
import type {
  PlaceHistoryRow,
  PlaceHistoryState,
  PlaceUploadPlan,
} from './processLocalPlaceSqlUploadTypes.ts'
import {
  buildPlaceMetadataSql,
  type placeTargets,
} from './processLocalPlaceSqlUploadMetadata.ts'
import {
  LOCAL_RELEASE_ROOT,
  SUPPLEMENTARY_CURATION_PATH,
  SUPPLEMENTARY_CURATION_DECISIONS_PATH,
  SUPPLEMENTARY_DEFAULT_DECISIONS_PATH,
  supplementaryEntryLedgerPath,
} from './processLocalPlaceSqlUploadConfig.ts'
import { insertSql, lit } from './processLocalPlaceSqlUploadImport.ts'
import { readStagedJsonLines } from './processLocalPlaceSqlUploadPreparation.ts'

type PrepareSupplementaryAddressesInput = {
  recordCache?: PlaceRecordCache
  retainAudit: (
    releaseId: string,
    datasetCode: string,
    audit: import('./placeProvenance').PlaceAddressAuditInput,
  ) => Promise<void>
  curationPath?: string
  curationDecisionsPath?: string
  entryLedgerPath?: string
  context: LocalAddressDbContext
  /** Disposable exact dependencies used for read-only Address analysis. */
  dependencyDb?: HarbourReadableDb
  metaDb: HarbourReadableDb & HarbourWritableDb
  snapshots: {
    snapshotId: string
    addressSnapshotId: string
    divisionSnapshotId: string
  }
  places: Iterable<NormalisedPlace> | AsyncIterable<NormalisedPlace>
  historyRows: PlaceHistoryState[]
  releaseRoot: string
  plan: PlaceUploadPlan
  releaseId: string
  datasetId: string
  targets: Awaited<ReturnType<typeof placeTargets>>
  importOptions: SqlImportExecutionOptions
  /** Counts source Places whose Address candidates have been analysed. */
  onProgress?: (current: number) => void
  /** Names the current uncounted preparation or materialisation substage. */
  onStage?: (stage: string) => void
}

const LOCK_INITIALISATION_GRACE_MS = 30_000

export async function prepareSupplementaryAddresses(
  input: PrepareSupplementaryAddressesInput,
) {
  await mkdir(LOCAL_RELEASE_ROOT, { recursive: true })
  const entryLedgerPath = resolveEntryLedgerPath(input)
  await mkdir(dirname(entryLedgerPath), { recursive: true })
  const lockPath = `${entryLedgerPath}.lock`
  const lock = await acquireSupplementaryAddressLock(lockPath)
  try {
    await lock.writeFile(
      JSON.stringify({ pid: process.pid, releaseId: input.releaseId }),
    )
    return await prepareSupplementaryAddressesLocked(input)
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

async function acquireSupplementaryAddressLock(lockPath: string) {
  for (;;) {
    try {
      return await open(lockPath, 'wx')
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
    }

    const owner = await readSupplementaryAddressLock(lockPath)
    if (owner.pid && isLiveProcess(owner.pid)) {
      throw new Error(
        `Supplementary Address preparation is already running for ${owner.releaseId ?? 'an unknown release'} (PID ${owner.pid}).`,
      )
    }
    if (owner.initialising) {
      throw new Error(
        'Supplementary Address preparation lock is still being initialised; retry shortly.',
      )
    }

    try {
      await unlink(lockPath)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
    }
  }
}

function resolveEntryLedgerPath(input: PrepareSupplementaryAddressesInput) {
  if (input.entryLedgerPath) return input.entryLedgerPath
  const target = input.importOptions.isLocal
    ? 'local'
    : input.targets.environment === 'production'
      ? 'production'
      : 'preview'
  return supplementaryEntryLedgerPath(target)
}

async function readOptionalFile(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null
    throw error
  }
}

async function writeSupplementaryEntryLedger(
  path: string,
  ledger: SupplementaryEntryLedger,
) {
  const text = `${JSON.stringify(ledger, null, 2)}\n`
  if ((await readOptionalFile(path)) === text) return
  const tempPath = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    await writeFile(tempPath, text, { flag: 'wx' })
    await rename(tempPath, path)
  } finally {
    await unlink(tempPath).catch(error => {
      if (errorCode(error) !== 'ENOENT') throw error
    })
  }
}

async function readSupplementaryAddressLock(lockPath: string) {
  try {
    const contents = await readFile(lockPath, 'utf8')
    const value = JSON.parse(contents) as { pid?: unknown; releaseId?: unknown }
    const pid = Number(value.pid)
    return {
      initialising: false,
      pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null,
      releaseId: typeof value.releaseId === 'string' ? value.releaseId : null,
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT')
      return { initialising: false, pid: null, releaseId: null }
    const metadata = await stat(lockPath).catch(() => null)
    return {
      initialising:
        metadata !== null &&
        Date.now() - metadata.mtimeMs < LOCK_INITIALISATION_GRACE_MS,
      pid: null,
      releaseId: null,
    }
  }
}

function isLiveProcess(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) !== 'ESRCH'
  }
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined
}

async function prepareSupplementaryAddressesLocked(
  input: PrepareSupplementaryAddressesInput,
) {
  const db = input.metaDb
  const currentDb = input.context.currentDb as unknown as HarbourReadableDb
  const dependencyDb = input.dependencyDb ?? currentDb
  input.onStage?.('official Address definitions')
  const curationPath = input.curationPath ?? SUPPLEMENTARY_CURATION_PATH
  const fixtureText = await readFile(curationPath, 'utf8')
  const curationDecisionsPath =
    input.curationDecisionsPath ??
    (input.curationPath ? undefined : SUPPLEMENTARY_CURATION_DECISIONS_PATH)
  const decisionText = curationDecisionsPath
    ? await readFile(curationDecisionsPath, 'utf8')
    : undefined
  const defaultDecisionText = await readOptionalFile(
    SUPPLEMENTARY_DEFAULT_DECISIONS_PATH,
  )
  const entryLedgerPath = resolveEntryLedgerPath(input)
  const entryLedgerText = await readOptionalFile(entryLedgerPath)
  const entryLedger = entryLedgerText
    ? parseSupplementaryEntryLedger(JSON.parse(entryLedgerText))
    : emptySupplementaryEntryLedger()
  const fixture = parseSupplementaryCuration(
    {
      ...JSON.parse(fixtureText),
      decisions: mergeSupplementaryDecisions(
        defaultDecisionText
          ? parseSupplementaryDecisionJsonLines(defaultDecisionText)
          : [],
        decisionText === undefined
          ? JSON.parse(fixtureText).decisions
          : parseSupplementaryDecisionJsonLines(decisionText),
      ),
    },
    entryLedger,
  )
  const official = (await dependencyDb
    .select({
      areaId: currentSchema.address2d.areaId,
      countryId: currentSchema.address2d.countryId,
      districtId: currentSchema.address2d.districtId,
      divisionSnapshotId: currentSchema.address2d.divisionSnapshotId,
      geometry: currentSchema.address2d.geometry,
      hamletId: currentSchema.address2d.hamletId,
      id: currentSchema.address2d.id,
      macrohoodId: currentSchema.address2d.macrohoodId,
      microhoodId: currentSchema.address2d.microhoodId,
      neighbourhoodId: currentSchema.address2d.neighbourhoodId,
      snapshotId: sql<string>`${input.snapshots.addressSnapshotId}`,
      townId: currentSchema.address2d.townId,
      villageId: currentSchema.address2d.villageId,
    })
    .from(currentSchema.address2d)
    .where(
      sql`${currentSchema.address2d.snapshotId} = (select ${currentSchema.addressPublicationState.scopeId} from ${currentSchema.addressPublicationState} where ${currentSchema.addressPublicationState.preparedAt} is not null and ${currentSchema.addressPublicationState.snapshotId} = ${input.snapshots.addressSnapshotId})`,
    )
    .all()) as unknown as Pick<
    typeof currentSchema.address2d.$inferSelect,
    | 'areaId'
    | 'countryId'
    | 'districtId'
    | 'divisionSnapshotId'
    | 'geometry'
    | 'hamletId'
    | 'id'
    | 'macrohoodId'
    | 'microhoodId'
    | 'neighbourhoodId'
    | 'snapshotId'
    | 'townId'
    | 'villageId'
  >[]
  const definitions = (await dependencyDb
    .select({
      addressId: currentSchema.address2dI18n.addressId,
      blockExpression: currentSchema.address2dI18n.blockExpression,
      buildingName: currentSchema.address2dI18n.buildingName,
      buildingNumberExpression: currentSchema.address2dI18n.buildingNumberExpression,
      buildingNumberFrom: currentSchema.address2dI18n.buildingNumberFrom,
      buildingNumberTo: currentSchema.address2dI18n.buildingNumberTo,
      estateName: currentSchema.address2dI18n.estateName,
      formattedAddress: currentSchema.address2dI18n.formattedAddress,
      locale: currentSchema.address2dI18n.locale,
      phaseExpression: currentSchema.address2dI18n.phaseExpression,
      streetName: currentSchema.address2dI18n.streetName,
    })
    .from(currentSchema.address2dI18n)
    .where(
      and(
        sql`${currentSchema.address2dI18n.snapshotId} = (select ${currentSchema.addressPublicationState.scopeId} from ${currentSchema.addressPublicationState} where ${currentSchema.addressPublicationState.preparedAt} is not null and ${currentSchema.addressPublicationState.snapshotId} = ${input.snapshots.addressSnapshotId})`,
        inArray(currentSchema.address2dI18n.locale, ['en', 'zh-hant']),
      ),
    )
    .all()) as PlaceAddressDefinition[]
  const geometry = new Map<string, { lng: number; lat: number }>()
  for (const row of official) {
    const value = parseWkbGeometry(row.geometry)
    if (value?.type === 'Point' && value.coordinates?.length === 2) {
      const [lng, lat] = value.coordinates
      if (lng !== undefined && lat !== undefined) geometry.set(row.id, { lng, lat })
    }
  }
  const officialById = new Map(official.map(row => [row.id, row]))
  const analyse = createSupplementaryAddressAnalyser(
    definitions,
    new Set(officialById.keys()),
    geometry,
    fixture,
    input.recordCache,
    true,
  )
  input.onStage?.('Place Address history')
  const previousById = new Map<string, PlaceHistoryRow>()
  for (const target of input.context.historyTargets) {
    const rows = (await (target.db as HarbourReadableDb)
      .select({
        address2dId: historySchema.places.address2dId,
        addressSnapshotId: historySchema.places.addressSnapshotId,
        addresses: historySchema.places.addresses,
        createdAt: historySchema.places.createdAt,
        id: historySchema.places.id,
        lastSeenMonth: historySchema.places.lastSeenMonth,
        releaseId: historySchema.places.releaseId,
      })
      .from(historySchema.places)
      .where(
        and(
          isNotNull(historySchema.places.address2dId),
          lte(historySchema.places.lastSeenMonth, input.plan.sourceVersion.slice(0, 7)),
          ne(historySchema.places.releaseId, input.releaseId),
        ),
      )
      .all()) as PlaceHistoryRow[]
    for (const row of rows) {
      const previous = previousById.get(row.id)
      if (
        !previous ||
        `${row.lastSeenMonth}:${row.createdAt}` >
          `${previous.lastSeenMonth}:${previous.createdAt}`
      )
        previousById.set(row.id, row)
    }
  }
  input.onStage?.('Place Address candidates')
  const resolutionPath = resolve(input.releaseRoot, 'overture-place-address.jsonl')
  const resolutionTempPath = temporaryPath(resolutionPath)
  const resolutionOutput = await open(resolutionTempPath, 'w')
  const supplementaryResolutions: StagedAddressResolution[] = []
  const resolutionCounts = new Map<AddressResolution['tier'], number>()
  const observedPlaceIds = new Set<string>()
  let analysedRows = 0
  try {
    try {
      for await (const place of input.places) {
        observedPlaceIds.add(place.id)
        const previous = previousById.get(place.id)
        const resolution = analyse(
          {
            placeId: place.id,
            sourceRelease: input.plan.sourceVersion,
            texts: extractPlaceAddressTexts(place.raw.addresses, place),
            lng: place.lng,
            lat: place.lat,
          },
          previous?.address2dId
            ? {
                addressId: previous.address2dId,
                addressSnapshotId: previous.addressSnapshotId,
                fingerprint: addressFingerprint(
                  Array.isArray(previous.addresses)
                    ? previous.addresses.filter(
                        (value): value is string => typeof value === 'string',
                      )
                    : [],
                ),
              }
            : null,
        )
        const stagedResolution = deferPlaceAddressReview(
          compactAddressResolution(resolution),
        )
        await resolutionOutput.write(`${JSON.stringify(stagedResolution)}\n`)
        resolutionCounts.set(
          resolution.tier,
          (resolutionCounts.get(resolution.tier) ?? 0) + 1,
        )
        if (resolution.tier === 'supplementary')
          supplementaryResolutions.push(stagedResolution)
        analysedRows += 1
        if (analysedRows % 5_000 === 0) input.onProgress?.(analysedRows)
      }
      input.onProgress?.(analysedRows)
    } finally {
      await resolutionOutput.close()
    }
    await rename(resolutionTempPath, resolutionPath)
  } catch (error) {
    await unlink(resolutionTempPath).catch(cleanupError => {
      if (errorCode(cleanupError) !== 'ENOENT') throw cleanupError
    })
    throw error
  }
  const reviewCount = resolutionCounts.get('review') ?? 0
  input.onStage?.('record Address decisions')
  // Always replace the release-owned review artefact, including on a successful retry.
  input.onStage?.('write Address review artefact')
  const reviewPath = resolve(input.releaseRoot, 'overture-place-address-review.json')
  await writeSupplementaryReviewArtefact({
    addressSnapshotId: input.snapshots.addressSnapshotId,
    authority: fixture.authority,
    placeReleaseId: input.releaseId,
    policies: fixture.policies,
    resolutionPath,
    reviewCount,
    reviewPath,
    sourceRelease: input.plan.sourceVersion,
  })
  // Detect another ingester/reviewer changing the unversioned identity policy.
  if ((await readFile(curationPath, 'utf8')) !== fixtureText)
    throw new Error('Place Address curation changed during analysis; retry.')
  if (
    curationDecisionsPath &&
    (await readFile(curationDecisionsPath, 'utf8')) !== decisionText
  )
    throw new Error('Place Address decisions changed during analysis; retry.')
  if (
    (await readOptionalFile(SUPPLEMENTARY_DEFAULT_DECISIONS_PATH)) !==
    defaultDecisionText
  )
    throw new Error('Place Address defaults changed during analysis; retry.')
  if ((await readOptionalFile(entryLedgerPath)) !== entryLedgerText)
    throw new Error('Generated Place Address entries changed during analysis; retry.')
  if (reviewCount)
    input.onStage?.(
      `Deferred ${reviewCount} unreviewed Address cases; links remain null; evidence retained at ${reviewPath}`,
    )
  // A Places release is complete. Once a generated Address's Place no longer
  // appears after it was first seen, retain the entry but close its lifecycle.
  for (const entry of fixture.entries) {
    if (
      !entry.revokedAt &&
      entry.firstSeen <= input.plan.sourceVersion &&
      !observedPlaceIds.has(entry.placeId)
    )
      entry.revokedAt = input.plan.sourceVersion
  }
  input.onStage?.('materialise supplementary Addresses')
  const parentDataset = (await db
    .select()
    .from(metaSchema.metaDatasets)
    .where(eq(metaSchema.metaDatasets.id, input.datasetId))
    .get()) as typeof metaSchema.metaDatasets.$inferSelect | undefined
  const parentRelease = (await db
    .select()
    .from(metaSchema.metaReleases)
    .where(eq(metaSchema.metaReleases.id, input.releaseId))
    .get()) as typeof metaSchema.metaReleases.$inferSelect | undefined
  if (!parentDataset || !parentRelease)
    throw new Error('Missing Place source registration.')
  const datasetCode = parentDataset.code
  const namespace = '747dc748-4086-5dc5-a0de-7d1fefcd0c51'
  const datasetId = parentDataset.id
  const releaseCode = `dr-${input.plan.regionCode}-overture-place-address-${input.plan.sourceVersion}`
  const existingRelease = (await db
    .select()
    .from(metaSchema.metaReleases)
    .where(eq(metaSchema.metaReleases.code, releaseCode))
    .get()) as typeof metaSchema.metaReleases.$inferSelect | undefined
  const releaseId =
    existingRelease?.id ?? buildDeterministicUuidV5(namespace, releaseCode)
  const sourceReleaseId = parentRelease.sourceReleaseId
  if (!sourceReleaseId) throw new Error('Missing shared Overture source release.')
  if (
    existingRelease &&
    (existingRelease.datasetId !== datasetId ||
      existingRelease.sourceReleaseId !== sourceReleaseId)
  )
    throw new Error('Supplementary Address release has incompatible source provenance.')
  const now = new Date().toISOString()
  await db
    .update(metaSchema.metaDatasets)
    .set({
      resourceTypes: sql`json_insert(${metaSchema.metaDatasets.resourceTypes}, '$[#]', 'address')`,
    })
    .where(
      and(
        eq(metaSchema.metaDatasets.id, datasetId),
        sql`NOT EXISTS (SELECT 1 FROM json_each(${metaSchema.metaDatasets.resourceTypes}) WHERE value = 'address')`,
      ),
    )
    .run()
  const release = {
    ...parentRelease,
    id: releaseId,
    datasetId,
    sourceReleaseId,
    code: releaseCode,
    resourceType: 'address' as const,
    status: 'processing' as const,
    processingRules: {
      policyVersion: fixture.activePolicy,
      policy: fixture.policies[fixture.activePolicy],
    },
    createdAt: now,
    updatedAt: now,
  }
  if (!existingRelease) {
    await db.insert(metaSchema.metaReleases).values(release).run()
  }
  const snapshot = await ensureDraftSnapshotForRelease(db, 'address', {
    cohortKey: input.plan.cohortKey,
    datasetCode,
    datasetId,
    sourceReleaseId: releaseId,
    regionCode: input.plan.regionCode,
    rootSnapshot: true,
    variant: SUPPLEMENTARY_ADDRESS_VARIANT,
  })
  const currentScopeId = snapshot.snapshotLineageId
  if (!currentScopeId)
    throw new Error(`Supplementary Address snapshot ${snapshot.id} has no lineage.`)
  const nextEntryLedger = {
    ...entryLedger,
    entries: fixture.entries,
  }
  // Draft retries need generated identities and lifecycle closures persisted
  // before SQL planning. A published immutable snapshot must pass its assembly
  // guard before it may update the shared ledger.
  if (snapshot.status !== 'published')
    await writeSupplementaryEntryLedger(entryLedgerPath, nextEntryLedger)
  const addresses = await buildSupplementaryAddressRows({
    resolutions: supplementaryResolutions,
    officialAddresses: officialById,
    snapshotId: snapshot.id,
    divisionSnapshotId: input.snapshots.divisionSnapshotId,
    sourceReleaseId: releaseId,
    placeSourceReleaseId: input.releaseId,
    sourceVersion: input.plan.sourceVersion,
    datasetId,
  })
  if (input.dependencyDb && addresses.length) {
    const selectedDivision = await db
      .select({ scopeId: metaSchema.metaSnapshots.snapshotLineageId })
      .from(metaSchema.metaSnapshots)
      .where(eq(metaSchema.metaSnapshots.id, input.snapshots.divisionSnapshotId))
      .get()
    if (!selectedDivision?.scopeId)
      throw new Error(
        'Supplementary Addresses require a recorded Division serving scope.',
      )
    const servingDivision = await currentDb
      .select({ scopeId: currentSchema.divisionPublicationState.scopeId })
      .from(currentSchema.divisionPublicationState)
      .where(
        and(
          eq(currentSchema.divisionPublicationState.scopeId, selectedDivision.scopeId),
          isNotNull(currentSchema.divisionPublicationState.preparedAt),
        ),
      )
      .get()
    if (!servingDivision)
      throw new Error(
        'Supplementary Addresses require a complete current Division scope.',
      )
    const selectedIds = [
      ...new Set(
        addresses.flatMap(row =>
          ADDRESS_DIVISION_FIELDS.flatMap(field => row.current[field] ?? []),
        ),
      ),
    ]
    const present = await currentDb
      .select({ id: currentSchema.divisions.id })
      .from(currentSchema.divisions)
      .where(
        and(
          eq(currentSchema.divisions.snapshotId, servingDivision.scopeId),
          sql`${currentSchema.divisions.id} in (select value from json_each(${JSON.stringify(selectedIds)}))`,
        ),
      )
      .all()
    if (new Set(present.map(row => row.id)).size !== selectedIds.length)
      throw new Error(
        'Supplementary Address derivation contains Division IDs absent from its current serving scope; review the reference before delivery.',
      )
    for (const row of addresses)
      row.current.divisionSnapshotId = servingDivision.scopeId
  }
  const materialisedAddressIds = new Set(addresses.map(row => row.current.id))
  const activeAddressIds = new Set(
    (
      await currentDb
        .select({ id: currentSchema.address2d.id })
        .from(currentSchema.address2d)
        .where(eq(currentSchema.address2d.snapshotId, currentScopeId))
        .all()
    ).map(row => row.id),
  )
  const scopeSnapshotIds = (
    await db
      .select({ id: metaSchema.metaSnapshots.id })
      .from(metaSchema.metaSnapshots)
      .where(eq(metaSchema.metaSnapshots.snapshotLineageId, currentScopeId))
      .all()
  ).map(row => row.id)
  const revokedAddressIds = [
    ...new Set([
      ...[...activeAddressIds].filter(id => !materialisedAddressIds.has(id)),
      ...(snapshot.status === 'published'
        ? await collectPublishedSupplementaryRevocations(
            input.context.historyTargets,
            snapshot.id,
          )
        : []),
      ...fixture.entries
        .filter(
          entry =>
            entry.revokedAt === input.plan.sourceVersion &&
            !materialisedAddressIds.has(entry.addressId),
        )
        .map(entry => entry.addressId),
    ]),
  ].sort()
  const policies = Object.fromEntries(
    [
      ...new Set(
        supplementaryResolutions.flatMap(row =>
          row.entry ? [row.entry.policyVersion] : [],
        ),
      ),
    ].map(version => [version, fixture.policies[version]]),
  )
  const materialisationHash = await createHash({
    addresses,
    policies,
    placeReleaseId: input.releaseId,
    addressSnapshotId: input.snapshots.addressSnapshotId,
    revokedAddressIds,
  })
  if (snapshot.status === 'published') {
    const runs = await db
      .select()
      .from(metaSchema.metaSnapshotAssemblyRuns)
      .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, snapshot.id))
      .all()
    if (
      !runs.some(
        run =>
          (run.selectionSummaryJson as { materialisationHash?: string } | null)
            ?.materialisationHash === materialisationHash,
      )
    ) {
      throw new Error(
        'Published supplementary snapshot differs from curation; create a release revision.',
      )
    }
    await assertSupplementaryAddressRows(currentDb, currentScopeId, addresses)
    await writeSupplementaryEntryLedger(entryLedgerPath, nextEntryLedger)
    await input.retainAudit(releaseId, datasetCode, {
      materialisationHash,
      fixture,
      resolutionPath,
      sourceVersion: input.plan.sourceVersion,
      supplementaryCount: addresses.length,
    })
  } else {
    // Each supplementary snapshot is a complete map, including an empty accepted set.
    await upsertSnapshotSource(db, snapshot.id, datasetId, releaseId, 'primary', {
      anchorReleaseId: input.releaseId,
      selectedByRule: 'overture-place-address-curation',
      selectionMode: 'exact_ref',
      sourceCohortKey: input.plan.cohortKey,
    })
    await recordSnapshotLookupDependency(db, {
      snapshotId: snapshot.id,
      anchorReleaseId: input.releaseId,
      lookupSnapshotId: input.snapshots.addressSnapshotId,
      selectedByRule: 'overture-place-address:selected-als',
      selectionMode: 'address_snapshot_reference',
    })
    await recordPlaceAddressAssembly(db, {
      snapshotId: snapshot.id,
      resourceType: 'address',
      anchorReleaseId: input.releaseId,
      anchorCohortKey: input.plan.cohortKey,
      selectionSummaryJson: {
        materialisationHash,
        policyVersion: fixture.activePolicy,
        policies,
        curationHash: await createHash({
          policy: JSON.parse(fixtureText),
          decisions: fixture.decisions,
          entryLedger: {
            ...entryLedger,
            entries: fixture.entries,
          },
        }),
        addressSnapshotId: input.snapshots.addressSnapshotId,
        reviewRequired: 0,
        unreviewedAddressCases: reviewCount,
        rowCount: addresses.length,
      },
    })
    const environment = input.targets.environment
    const historyShard = await resolveShardForTypeRegionYear(
      db,
      'history',
      environment,
      input.plan.regionCode,
      input.plan.sourceVersion.slice(0, 4),
    )
    if (historyShard)
      await upsertSnapshotShardAssignment(db, snapshot.id, historyShard.id)
    if (historyShard) await upsertReleaseShardAssignment(db, releaseId, historyShard.id)
    await deliverResolvedAddressSqlPhase(
      {
        context: input.context,
        releaseId: input.releaseId,
        phase: 'places-address-publication-data',
        nativeLocal: true,
        scopeId: currentScopeId,
        snapshotId: snapshot.id,
        expectedCount: addresses.length,
        inputs: { materialisationHash, snapshotId: snapshot.id },
      },
      async candidates => {
        if (!historyShard)
          throw new Error('Supplementary Address publication requires a history shard.')
        const owners = await materialiseSupplementaryAddressHistory({
          candidates,
          addresses,
          scopeId: currentScopeId,
          scopeSnapshotIds,
          snapshotId: snapshot.id,
          releaseId,
          historyBinding: historyShard.bindingName,
          revokedAddressIds,
          now,
        })
        const shards = await db
          .select({
            id: metaSchema.metaDataShards.id,
            bindingName: metaSchema.metaDataShards.bindingName,
          })
          .from(metaSchema.metaDataShards)
          .where(
            and(
              eq(metaSchema.metaDataShards.shardType, 'history'),
              eq(metaSchema.metaDataShards.environment, environment),
            ),
          )
          .all()
        for (const binding of owners) {
          const owner = shards.find(shard => shard.bindingName === binding)
          if (!owner || typeof owner.id !== 'string')
            throw new Error(`Missing supplementary content owner ${binding}.`)
          await upsertSnapshotShardAssignment(db, snapshot.id, owner.id)
        }
        if (!input.importOptions.isLocal) {
          await executeSqlText(
            input.targets.meta,
            [
              `UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'address') WHERE id = ${lit(datasetId)} AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'address');`,
              insertSql('releases', release),
              await buildPlaceMetadataSql(db, snapshot.id, releaseId),
            ].join('\n'),
            input.importOptions,
          )
        }
      },
    )
    input.onStage?.('verify supplementary Address rows')
    await assertSupplementaryAddressRows(currentDb, currentScopeId, addresses)
    await input.retainAudit(releaseId, datasetCode, {
      materialisationHash,
      fixture,
      resolutionPath,
      sourceVersion: input.plan.sourceVersion,
      supplementaryCount: addresses.length,
    })
    // Publication follows successful imports. A retry of a published snapshot must reproduce its hash.
    await publishSnapshot(db, snapshot.id)
    await db
      .update(metaSchema.metaReleases)
      .set({ status: 'published', updatedAt: now })
      .where(eq(metaSchema.metaReleases.id, releaseId))
      .run()
    // The shared source is finalised by Places publication after both outputs succeed.
  }
  if (!input.importOptions.isLocal) {
    input.onStage?.('sync supplementary Address metadata')
    // Retry a metadata-publication failure after the data import without rewriting Address rows.
    await deliverSqlPhase(
      {
        context: input.context,
        releaseId: input.releaseId,
        phase: 'places-address-metadata',
        nativeLocal: true,
        inputs: { materialisationHash, snapshotId: snapshot.id },
      },
      async () =>
        executeSqlText(
          input.targets.meta,
          [
            await buildPlaceMetadataSql(db, snapshot.id, releaseId),
            `UPDATE releases SET status = 'published' WHERE id = ${lit(releaseId)};`,
          ].join('\n'),
          input.importOptions,
        ),
    )
  }
  await recordSnapshotLookupDependency(db, {
    snapshotId: input.snapshots.snapshotId,
    anchorReleaseId: input.releaseId,
    lookupSnapshotId: snapshot.id,
    selectedByRule:
      'api-composition:places/overture:place/default->address/overture-places',
    selectionMode: 'exact_ref',
  })
  return {
    audit: {
      materialisationHash,
      fixture,
      resolutionPath,
      sourceVersion: input.plan.sourceVersion,
      supplementaryCount: addresses.length,
    },
    resolutionPath,
    releaseId,
    releaseCode,
    snapshotId: snapshot.id,
    addresses,
  }
}

export async function collectPublishedSupplementaryRevocations(
  targets: LocalAddressDbContext['historyTargets'],
  snapshotId: string,
) {
  const ids = new Set<string>()
  for (const target of targets) {
    const rows = await (target.db as HarbourReadableDb)
      .select({ recordId: historySchema.snapshotVersionChanges.recordId })
      .from(historySchema.snapshotVersionChanges)
      .where(
        and(
          eq(historySchema.snapshotVersionChanges.snapshotId, snapshotId),
          eq(historySchema.snapshotVersionChanges.recordType, 'address2d'),
          eq(historySchema.snapshotVersionChanges.operation, 'delete'),
        ),
      )
      .all()
    for (const row of rows) ids.add(row.recordId)
  }
  return [...ids].sort()
}

function mergeSupplementaryDecisions(
  defaults: ReturnType<typeof parseSupplementaryDecisionJsonLines>,
  curated: ReturnType<typeof parseSupplementaryDecisionJsonLines>,
) {
  const decisions = new Map(
    defaults.map(decision => [
      `${decision.placeId}\0${decision.sourceRelease}\0${decision.fingerprint}`,
      decision,
    ]),
  )
  for (const decision of curated)
    decisions.set(
      `${decision.placeId}\0${decision.sourceRelease}\0${decision.fingerprint}`,
      decision,
    )
  return [...decisions.values()]
}

async function writeSupplementaryReviewArtefact(input: {
  addressSnapshotId: string
  authority: string
  placeReleaseId: string
  policies: unknown
  resolutionPath: string
  reviewCount: number
  reviewPath: string
  sourceRelease: string
}) {
  const tempPath = temporaryPath(input.reviewPath)
  const output = await open(tempPath, 'w')
  try {
    try {
      const header = JSON.stringify(
        {
          addressSnapshotId: input.addressSnapshotId,
          authority: input.authority,
          placeReleaseId: input.placeReleaseId,
          policies: input.policies,
          reviewRequired: input.reviewCount,
          sourceRelease: input.sourceRelease,
          version: 1,
          results: null,
        },
        null,
        2,
      )
      await output.write(
        `${header.replace('\n  "results": null\n}', '\n  "results": [')}`,
      )
      let first = true
      for await (const resolution of readStagedJsonLines<StagedAddressResolution>(
        input.resolutionPath,
      )) {
        if (resolution.tier !== 'review' && !resolution.reviewDeferral) continue
        await output.write(`${first ? '\n' : ',\n'}    ${JSON.stringify(resolution)}`)
        first = false
      }
      await output.write('\n  ]\n}\n')
    } finally {
      await output.close()
    }
    await rename(tempPath, input.reviewPath)
  } catch (error) {
    await unlink(tempPath).catch(cleanupError => {
      if (errorCode(cleanupError) !== 'ENOENT') throw cleanupError
    })
    throw error
  }
}

function temporaryPath(path: string) {
  return `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
}

import { deliverSqlPhase } from '../local/sqlDeliveryPhase.ts'
