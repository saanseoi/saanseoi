import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  stat,
  unlink,
} from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
import { replaceReleaseProcessingActions } from '@repo/core/pipeline/db/processingActions'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import {
  extractPlaceAddressTexts,
  type NormalisedPlace,
} from '@repo/core/pipeline/services/place'
import {
  addressFingerprint,
  createSupplementaryAddressAnalyser,
  parseSupplementaryCuration,
  type AddressResolution,
} from './supplementaryPlaceAddress.ts'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import {
  buildSupplementaryAddressRows,
  SUPPLEMENTARY_ADDRESS_VARIANT,
} from './supplementaryPlaceAddressRows.ts'
import { createHash } from '@repo/core/pipeline/utils'
import { parseWkbGeometry } from '@repo/core/pipeline/services/division'
import { recordPlaceAddressAssembly } from '@repo/core/pipeline/services/placeAddressAssembly'
import { buildAddressBuildingNumberLookupRows } from '@repo/core/pipeline/services/addressPipeline/normalisation'
import {
  currentSchema,
  historySchema,
  metaSchema,
  buildDeterministicUuidV5,
} from '@repo/db'
import { and, eq, ne, isNotNull, lte } from 'drizzle-orm'
import type { LocalAddressDbContext } from '../dbCache/localDbCache.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
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
} from './processLocalPlaceSqlUploadConfig.ts'
import { chunkStatements, insertSql, lit } from './processLocalPlaceSqlUploadImport.ts'
import { readStagedJsonLines } from './processLocalPlaceSqlUploadPreparation.ts'

type PrepareSupplementaryAddressesInput = {
  curationPath?: string
  context: LocalAddressDbContext
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
  actions: ReleaseProcessingAction[]
}

const LOCK_INITIALISATION_GRACE_MS = 30_000

export async function prepareSupplementaryAddresses(
  input: PrepareSupplementaryAddressesInput,
) {
  await mkdir(LOCAL_RELEASE_ROOT, { recursive: true })
  const lockPath = resolve(
    input.curationPath ? input.releaseRoot : LOCAL_RELEASE_ROOT,
    'overture-place-address.lock',
  )
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
  const curationPath = input.curationPath ?? SUPPLEMENTARY_CURATION_PATH
  const fixtureText = await readFile(curationPath, 'utf8')
  const fixture = parseSupplementaryCuration(JSON.parse(fixtureText))
  const official = (await currentDb
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
      snapshotId: currentSchema.address2d.snapshotId,
      townId: currentSchema.address2d.townId,
      villageId: currentSchema.address2d.villageId,
    })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, input.snapshots.addressSnapshotId))
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
  const definitions = (await currentDb
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
      eq(currentSchema.address2dI18n.snapshotId, input.snapshots.addressSnapshotId),
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
  )
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
  const resolutionPath = resolve(input.releaseRoot, 'overture-place-address.jsonl')
  const resolutionTempPath = `${resolutionPath}.tmp`
  const resolutionOutput = await open(resolutionTempPath, 'w')
  const supplementaryResolutions: AddressResolution[] = []
  const resolutionCounts = new Map<AddressResolution['tier'], number>()
  const resolutionReasons = new Map<AddressResolution['tier'], Set<string>>()
  try {
    for await (const place of input.places) {
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
      await resolutionOutput.write(`${JSON.stringify(resolution)}\n`)
      resolutionCounts.set(
        resolution.tier,
        (resolutionCounts.get(resolution.tier) ?? 0) + 1,
      )
      const reasons = resolutionReasons.get(resolution.tier) ?? new Set<string>()
      reasons.add(resolution.reason)
      resolutionReasons.set(resolution.tier, reasons)
      if (resolution.tier === 'supplementary') supplementaryResolutions.push(resolution)
    }
  } finally {
    await resolutionOutput.close()
  }
  await rename(resolutionTempPath, resolutionPath)
  const reviewCount = resolutionCounts.get('review') ?? 0
  const actions: ReleaseProcessingAction[] = [
    ...input.actions,
    ...(['direct', 'supplementary', 'review', 'delayed'] as const).map(tier => ({
      action: `overture_place_address_${tier}`,
      mode: 'automatic' as const,
      affectedRecordCount: resolutionCounts.get(tier) ?? 0,
      summary: `Overture Place Address analysis: ${tier}.`,
      evidence: {
        policyVersion: fixture.activePolicy,
        policy: fixture.policies[fixture.activePolicy],
        reviewArtefact: 'overture-place-address-review.json',
        reasons: [...(resolutionReasons.get(tier) ?? [])],
      },
    })),
  ]
  await replaceReleaseProcessingActions(db, input.releaseId, actions)
  if (!input.importOptions.isLocal) {
    const stored = await db
      .select()
      .from(metaSchema.releaseProcessingActions)
      .where(eq(metaSchema.releaseProcessingActions.releaseId, input.releaseId))
      .all()
    for (const sql of chunkStatements([
      `DELETE FROM releaseProcessingActions WHERE releaseId = ${lit(input.releaseId)};`,
      ...stored.map(row => insertSql('releaseProcessingActions', row)),
    ])) {
      await executeSqlText(input.targets.meta, sql, input.importOptions)
    }
  }
  // Always replace the release-owned review artefact, including on a successful retry.
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
  const acceptedText = `${JSON.stringify(fixture, null, 2)}\n`
  if (acceptedText !== fixtureText) {
    await writeFile(`${curationPath}.tmp`, acceptedText, { flag: 'wx' })
    await rename(`${curationPath}.tmp`, curationPath)
  }
  if (reviewCount)
    throw new Error(
      `${reviewCount} Place Address identities require explicit curation in ${curationPath}. Review ${reviewPath}; --yes cannot select identities.`,
    )

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
    .insert(metaSchema.metaDatasetResourceTypes)
    .values({ datasetId, resourceType: 'address' })
    .onConflictDoNothing()
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
    variant: SUPPLEMENTARY_ADDRESS_VARIANT,
  })
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
    await assertSupplementaryAddressRows(currentDb, snapshot.id, addresses)
  } else {
    // Each supplementary snapshot is a complete map, including an empty accepted set.
    // Replay must not inherit withdrawn addresses from a previous cohort.
    await db
      .update(metaSchema.metaSnapshots)
      .set({ parentSnapshotId: null })
      .where(eq(metaSchema.metaSnapshots.id, snapshot.id))
      .run()
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
        curationHash: await createHash(fixture),
        addressSnapshotId: input.snapshots.addressSnapshotId,
        reviewRequired: 0,
        rowCount: addresses.length,
      },
    })
    const environment = input.targets.environment
    const currentShard = await resolveShardForTypeRegionYear(db, 'current', environment)
    const historyShard = await resolveShardForTypeRegionYear(
      db,
      'history',
      environment,
      input.plan.regionCode,
      input.plan.sourceVersion.slice(0, 4),
    )
    if (currentShard)
      await upsertSnapshotShardAssignment(db, snapshot.id, currentShard.id)
    if (historyShard) await upsertReleaseShardAssignment(db, releaseId, historyShard.id)
    if (!input.importOptions.isLocal) {
      await executeSqlText(
        input.targets.meta,
        [
          insertSql('datasetResourceTypes', { datasetId, resourceType: 'address' }),
          insertSql('releases', release),
          await buildPlaceMetadataSql(db, snapshot.id, releaseId),
        ].join('\n'),
        input.importOptions,
      )
    }
    const currentSql = [
      `DELETE FROM address2dBuildingNumberLookup WHERE snapshotId = ${lit(snapshot.id)};`,
      `DELETE FROM address2dI18n WHERE snapshotId = ${lit(snapshot.id)};`,
      `DELETE FROM address2d WHERE snapshotId = ${lit(snapshot.id)};`,
    ]
    for (const target of input.targets.historyByBinding.values()) {
      await importSupplementarySql(
        target,
        "UPDATE address2d SET isCurrent = 0 WHERE id LIKE 'opa-%' AND isCurrent = 1; UPDATE address2dI18n SET isCurrent = 0 WHERE addressId LIKE 'opa-%' AND isCurrent = 1; UPDATE address2dBuildingNumberLookup SET isCurrent = 0 WHERE addressId LIKE 'opa-%' AND isCurrent = 1;",
        input.importOptions,
      )
    }
    const historySql: string[] = []
    const changes: string[] = [
      `DELETE FROM snapshotVersionChanges WHERE snapshotId = ${lit(snapshot.id)};`,
    ]
    for (const row of addresses) {
      const version = {
        versionHash: row.versionHash,
        snapshotId: snapshot.id,
        sourceReleaseId: releaseId,
        isCurrent: 1,
        createdAt: now,
        updatedAt: now,
      }
      currentSql.push(
        insertSql('address2d', { ...row.current, createdAt: now, updatedAt: now }),
      )
      historySql.push(insertSql('address2d', { ...row.canonical, ...version }))
      for (const lookup of buildAddressBuildingNumberLookupRows(row.i18n)) {
        currentSql.push(
          insertSql('address2dBuildingNumberLookup', {
            ...lookup,
            snapshotId: snapshot.id,
            createdAt: now,
            updatedAt: now,
          }),
        )
        historySql.push(
          insertSql('address2dBuildingNumberLookup', { ...lookup, ...version }),
        )
      }
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: snapshot.id,
          recordType: 'address2d',
          recordId: row.current.id,
          locale: '',
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
      for (const value of row.i18n) {
        currentSql.push(
          insertSql('address2dI18n', {
            ...value,
            snapshotId: snapshot.id,
            createdAt: now,
            updatedAt: now,
          }),
        )
        historySql.push(insertSql('address2dI18n', { ...value, ...version }))
        changes.push(
          insertSql('snapshotVersionChanges', {
            snapshotId: snapshot.id,
            recordType: 'address2dI18n',
            recordId: row.current.id,
            locale: value.locale,
            versionHash: row.versionHash,
            operation: 'upsert',
            sourceReleaseId: releaseId,
            createdAt: now,
            updatedAt: now,
          }),
        )
      }
    }
    for (const [target, statements] of [
      [input.targets.current, currentSql],
      [input.targets.history, [...historySql, ...changes]],
    ] as const) {
      for (const sql of chunkStatements(statements))
        await importSupplementarySql(target, sql, input.importOptions)
    }
    await importSupplementarySql(
      input.targets.current,
      readFileSync(
        resolve(
          import.meta.dir,
          '../../../../../libs/db/scripts/sql/rebuild-addresses-fts.sql',
        ),
        'utf8',
      ),
      input.importOptions,
    )
    await assertSupplementaryAddressRows(currentDb, snapshot.id, addresses)
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
    // Retry a metadata-publication failure after the data import without rewriting Address rows.
    await executeSqlText(
      input.targets.meta,
      [
        await buildPlaceMetadataSql(db, snapshot.id, releaseId),
        `UPDATE releases SET status = 'published' WHERE id = ${lit(releaseId)};`,
      ].join('\n'),
      input.importOptions,
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
    resolutionPath,
    releaseId,
    releaseCode,
    snapshotId: snapshot.id,
    addresses,
  }
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
  const tempPath = `${input.reviewPath}.tmp`
  const output = await open(tempPath, 'w')
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
    for await (const resolution of readStagedJsonLines<AddressResolution>(
      input.resolutionPath,
    )) {
      await output.write(`${first ? '\n' : ',\n'}    ${JSON.stringify(resolution)}`)
      first = false
    }
    await output.write('\n  ]\n}\n')
  } finally {
    await output.close()
  }
  await rename(tempPath, input.reviewPath)
}

async function importSupplementarySql(
  target: SqlImportTargetContext,
  sql: string,
  options: SqlImportExecutionOptions,
) {
  await executeSqlText(target, sql, options)
  if (!options.isLocal) await executeSqlText(target, sql, { ...options, isLocal: true })
}

async function assertSupplementaryAddressRows(
  db: HarbourReadableDb,
  snapshotId: string,
  expected: Awaited<ReturnType<typeof buildSupplementaryAddressRows>>,
) {
  const rows = await db
    .select()
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, snapshotId))
    .all()
  const localisations = await db
    .select()
    .from(currentSchema.address2dI18n)
    .where(eq(currentSchema.address2dI18n.snapshotId, snapshotId))
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
          Object.fromEntries(Object.keys(wanted).map(key => [key, actual[key]])),
        )) !== (await createHash(wanted))
      ) {
        throw new Error(
          `Supplementary Address ${row.current.id} cannot be reproduced from its materialised row.`,
        )
      }
    }
  }
}
