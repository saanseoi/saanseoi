import type { HarbourReadableDb } from '@repo/core/db/types'
import { createHash } from '@repo/core/pipeline/utils'
import { historySchema } from '@repo/db'
import { eq } from 'drizzle-orm'
import { latLngToCell } from 'h3-js'
import type { LocalAddressDbContext } from '../dbCache/localDbCache.ts'
import type {
  BuildPlaceSqlInput,
  BuildPlaceSqlOptions,
  EnrichedPlace,
  PlaceHistoryRow,
  PlaceHistoryState,
  PlaceSqlProgressEvent,
} from './processLocalPlaceSqlUploadTypes.ts'
import {
  insertSql,
  lit,
  numberOrNull,
  recordValue,
} from './processLocalPlaceSqlUploadImport.ts'
import {
  PLACE_H3_LEVELS,
  PLACE_SQL_BATCH_SIZE,
} from './processLocalPlaceSqlUploadConfig.ts'
import { readStagedJsonBatches } from './processLocalPlaceSqlUploadPreparation.ts'

export async function loadCurrentPlaceHistory(
  targets: LocalAddressDbContext['historyTargets'],
): Promise<PlaceHistoryState[]> {
  const rows = await Promise.all(
    targets.map(async target => ({
      bindingName: target.bindingName,
      rows: (await (target.db as HarbourReadableDb)
        .select({
          address2dId: historySchema.places.address2dId,
          addressSnapshotId: historySchema.places.addressSnapshotId,
          addresses: historySchema.places.addresses,
          createdAt: historySchema.places.createdAt,
          firstSeenMonth: historySchema.places.firstSeenMonth,
          id: historySchema.places.id,
          lastSeenMonth: historySchema.places.lastSeenMonth,
          releaseId: historySchema.places.releaseId,
          versionHash: historySchema.places.versionHash,
        })
        .from(historySchema.places)
        .where(eq(historySchema.places.isCurrent, true))
        .all()) as unknown as PlaceHistoryRow[],
    })),
  )
  return rows.flatMap(target =>
    target.rows.map(row => ({ bindingName: target.bindingName, row })),
  )
}

export async function buildPlaceSql(
  input: BuildPlaceSqlInput,
  options: BuildPlaceSqlOptions = {},
) {
  const includeInitialStatements = options.includeInitialStatements ?? true
  const includeRemovedPlaces = options.includeRemovedPlaces ?? true
  const now = options.timestamp ?? new Date().toISOString()
  const currentSql: string[] = includeInitialStatements
    ? [
        `DELETE FROM placesCells WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
        `DELETE FROM placesDivision WHERE placeSnapshotId = ${lit(input.snapshots.snapshotId)};`,
        `DELETE FROM placesI18n WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
        `DELETE FROM places WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
      ]
    : []
  const historySqlByBinding = new Map<string, string[]>()
  const sourceSqlByBinding = new Map<string, string[]>()
  const changes: string[] = []
  const previousById = new Map(input.historyRows.map(state => [state.row.id, state]))

  const historyStatements = (bindingName: string) => {
    const statements = historySqlByBinding.get(bindingName)
    if (statements) return statements
    const created: string[] = []
    historySqlByBinding.set(bindingName, created)
    return created
  }
  const sourceStatements = (bindingName: string) => {
    const statements = sourceSqlByBinding.get(bindingName)
    if (statements) return statements
    const created: string[] = []
    sourceSqlByBinding.set(bindingName, created)
    return created
  }

  if (includeInitialStatements) {
    for (const bindingName of input.sourceBindingNames) {
      sourceStatements(bindingName).push(
        `UPDATE overturePlaces SET isCurrent = 0, validToRelease = ${lit(input.message.sourceVersion)}, updatedAt = ${lit(now)} WHERE isCurrent = 1;`,
      )
    }
  }

  let processedPlaceRows = 0
  for (const row of input.places) {
    const place = row.place
    const previous = previousById.get(place.id)
    const firstSeenMonth =
      typeof previous?.row.firstSeenMonth === 'string'
        ? previous.row.firstSeenMonth
        : place.firstSeenMonth
    sourceStatements(input.activeSourceBindingName).push(
      insertSql('overturePlaces', {
        sourceRecordId: place.id,
        sources: place.sources,
        rawProperties: place.raw,
        version: numberOrNull(place.raw.version),
        versionHash: row.sourcePayloadHash,
        releaseId: input.message.releaseId,
        validFromRelease: input.message.sourceVersion,
        validToRelease: null,
        isCurrent: 1,
        names: place.raw.names,
        lng: place.lng,
        lat: place.lat,
        bbox: place.bbox,
        operatingStatus: place.operatingStatus,
        basicCategory: place.basicCategory,
        taxonomyPrimary: place.taxonomyPrimary,
        taxonomyHierarchy: place.taxonomyHierarchy,
        taxonomyAlternates: place.taxonomyAlternates,
        wikidataId: place.wikidataId,
        brandNames: recordValue(place.raw.brand, 'names'),
        websites: place.websites,
        socials: place.socials,
        emails: place.emails,
        phones: place.phones,
        addresses: place.addresses,
        confidence: place.confidence,
        createdAt: now,
        updatedAt: now,
      }),
    )
    currentSql.push(
      insertSql('places', {
        snapshotId: input.snapshots.snapshotId,
        id: place.id,
        releaseId: input.message.releaseId,
        addressSnapshotId: row.address2dId
          ? (row.addressSnapshotId ?? input.snapshots.addressSnapshotId)
          : null,
        address2dId: row.address2dId,
        address3dId: row.address3dId,
        lng: place.lng,
        lat: place.lat,
        bbox: place.bbox,
        operatingStatus: place.operatingStatus,
        basicCategory: place.basicCategory,
        taxonomyPrimary: place.taxonomyPrimary,
        taxonomyHierarchy: place.taxonomyHierarchy,
        taxonomyAlternates: place.taxonomyAlternates,
        wikidataId: place.wikidataId,
        websites: place.websites,
        socials: place.socials,
        emails: place.emails,
        phones: place.phones,
        addresses: place.addresses,
        confidence: place.confidence,
        sources: place.sources,
        firstSeenMonth,
        lastSeenMonth: place.lastSeenMonth,
        createdAt: now,
        updatedAt: now,
      }),
    )
    for (const h3Level of PLACE_H3_LEVELS) {
      currentSql.push(
        insertSql('placesCells', {
          snapshotId: input.snapshots.snapshotId,
          id: place.id,
          h3Level,
          h3Cell: latLngToCell(place.lat, place.lng, h3Level),
        }),
      )
    }
    for (const localised of place.i18n) {
      currentSql.push(
        insertSql('placesI18n', {
          snapshotId: input.snapshots.snapshotId,
          placeId: place.id,
          locale: localised.locale,
          name: localised.name,
          nameVariant: localised.nameVariant,
          nameAlts: localised.nameAlts,
          brandName: localised.brandName,
          brandNameVariant: localised.brandNameVariant,
          brandNameAlts: localised.brandNameAlts,
          freeformAddress: localised.freeformAddress,
          provenance: localised.provenance,
          createdAt: now,
          updatedAt: now,
        }),
      )
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'placeI18n',
          recordId: place.id,
          locale: localised.locale,
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
    for (const divisionId of row.divisionIds) {
      currentSql.push(
        insertSql('placesDivision', {
          placeSnapshotId: input.snapshots.snapshotId,
          placeId: place.id,
          divisionSnapshotId: input.snapshots.divisionSnapshotId,
          divisionId,
        }),
      )
    }

    if (previous?.row.versionHash !== row.versionHash) {
      if (previous) {
        historyStatements(previous.bindingName).push(
          `UPDATE places SET isCurrent = 0, updatedAt = ${lit(now)} WHERE id = ${lit(place.id)} AND isCurrent = 1;`,
        )
        historyStatements(previous.bindingName).push(
          `UPDATE placesI18n SET isCurrent = 0, updatedAt = ${lit(now)} WHERE placeId = ${lit(place.id)} AND isCurrent = 1;`,
        )
      }
      historyStatements(input.activeHistoryBindingName).push(
        insertSql('places', {
          id: place.id,
          releaseId: input.message.releaseId,
          addressSnapshotId: row.address2dId
            ? (row.addressSnapshotId ?? input.snapshots.addressSnapshotId)
            : null,
          address2dId: row.address2dId,
          address3dId: row.address3dId,
          lng: place.lng,
          lat: place.lat,
          bbox: place.bbox,
          operatingStatus: place.operatingStatus,
          basicCategory: place.basicCategory,
          taxonomyPrimary: place.taxonomyPrimary,
          taxonomyHierarchy: place.taxonomyHierarchy,
          taxonomyAlternates: place.taxonomyAlternates,
          wikidataId: place.wikidataId,
          websites: place.websites,
          socials: place.socials,
          emails: place.emails,
          phones: place.phones,
          addresses: place.addresses,
          confidence: place.confidence,
          sources: place.sources,
          firstSeenMonth,
          lastSeenMonth: place.lastSeenMonth,
          versionHash: row.versionHash,
          sourceReleaseId: input.message.releaseId,
          snapshotId: input.snapshots.snapshotId,
          isCurrent: 1,
          createdAt: now,
          updatedAt: now,
        }),
      )
      for (const localised of place.i18n) {
        const i18nVersionHash = await createHash({
          placeVersionHash: row.versionHash,
          locale: localised.locale,
          localised,
        })
        historyStatements(input.activeHistoryBindingName).push(
          insertSql('placesI18n', {
            placeId: place.id,
            locale: localised.locale,
            name: localised.name,
            nameVariant: localised.nameVariant,
            nameAlts: localised.nameAlts,
            brandName: localised.brandName,
            brandNameVariant: localised.brandNameVariant,
            brandNameAlts: localised.brandNameAlts,
            freeformAddress: localised.freeformAddress,
            provenance: localised.provenance,
            versionHash: i18nVersionHash,
            sourceReleaseId: input.message.releaseId,
            snapshotId: input.snapshots.snapshotId,
            isCurrent: 1,
            createdAt: now,
            updatedAt: now,
          }),
        )
      }
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'place',
          recordId: place.id,
          locale: '',
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    } else {
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'place',
          recordId: place.id,
          locale: '',
          versionHash: previous.row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
    processedPlaceRows += 1
    options.onProgress?.(processedPlaceRows)
  }

  if (includeRemovedPlaces) {
    const seen = new Set(input.places.map(row => row.place.id))
    for (const previous of previousById.values()) {
      const previousId =
        typeof previous.row.id === 'string' ? previous.row.id : String(previous.row.id)
      if (seen.has(previousId)) continue
      historyStatements(previous.bindingName).push(
        `UPDATE places SET isCurrent = 0, updatedAt = ${lit(now)} WHERE id = ${lit(previousId)} AND isCurrent = 1;`,
      )
      historyStatements(previous.bindingName).push(
        `UPDATE placesI18n SET isCurrent = 0, updatedAt = ${lit(now)} WHERE placeId = ${lit(previousId)} AND isCurrent = 1;`,
      )
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'place',
          recordId: previous.row.id,
          locale: '',
          versionHash: null,
          operation: 'delete',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
  }

  return {
    currentSql,
    historySqlByBinding,
    sourceSqlByBinding,
    changes,
  }
}

export async function* buildPlaceSqlBatches(
  input: BuildPlaceSqlInput,
  path: string,
  timestamp: string,
  onProgress?: (event: PlaceSqlProgressEvent) => void,
) {
  const historyById = new Map(
    input.historyRows.map(state => [String(state.row.id), state]),
  )
  const seen = new Set<string>()
  let yielded = false
  let processedRows = 0

  for await (const places of readStagedJsonBatches<EnrichedPlace>(
    path,
    PLACE_SQL_BATCH_SIZE,
  )) {
    const historyRows: PlaceHistoryState[] = []
    for (const place of places) {
      const placeId = place.place.id
      seen.add(placeId)
      const previous = historyById.get(placeId)
      if (previous) historyRows.push(previous)
    }

    yield await buildPlaceSql(
      { ...input, historyRows, places },
      {
        includeInitialStatements: !yielded,
        includeRemovedPlaces: false,
        onProgress: current =>
          onProgress?.({ current: processedRows + current, phase: 'generate' }),
        timestamp,
      },
    )
    yielded = true
    processedRows += places.length
  }

  const removedHistoryRows = input.historyRows.filter(
    state => !seen.has(String(state.row.id)),
  )
  if (!yielded || removedHistoryRows.length > 0) {
    yield await buildPlaceSql(
      { ...input, historyRows: removedHistoryRows, places: [] },
      {
        includeInitialStatements: !yielded,
        includeRemovedPlaces: true,
        timestamp,
      },
    )
  }
}
