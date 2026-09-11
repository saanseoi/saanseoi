import { PlaceProjectionSql } from './placeProjectionSql.ts'
import { missingSourceMembershipPredicates } from '../local/sourceMembershipSql.ts'
import { sourceResolutionSql } from '@repo/core/pipeline/db/sourceResolutions'
import { overtureSourcePayload } from '@repo/core/pipeline/services/sources/sourcePayload'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { createHash } from '@repo/core/pipeline/utils'
import { historySchema, sourceSchema } from '@repo/db'
import { eq } from 'drizzle-orm'
import { latLngToCell } from 'h3-js'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import type {
  BuildPlaceSqlInput,
  BuildPlaceSqlOptions,
  EnrichedPlace,
  PlaceHistoryRow,
  PlaceHistoryState,
  PlaceSqlProgressEvent,
} from './processLocalPlaceSqlUploadTypes.ts'
import { insertSql, lit } from './processLocalPlaceSqlUploadImport.ts'
import {
  MAX_SQL_BYTES,
  PLACE_H3_LEVELS,
  PLACE_SQL_BATCH_SIZE,
} from './processLocalPlaceSqlUploadConfig.ts'
import { readStagedJsonBatches } from './processLocalPlaceSqlUploadPreparation.ts'

export async function loadCurrentPlaceSources(
  targets: LocalAddressDbContext['sourceTargets'],
): Promise<NonNullable<BuildPlaceSqlInput['sourceRows']>> {
  const table = sourceSchema.sourceOverturePlaces
  const groups = await Promise.all(
    targets.map(async target => ({
      bindingName: target.bindingName,
      rows: await (target.db as HarbourReadableDb)
        .select({
          sourceRecordId: table.sourceRecordId,
          versionHash: table.versionHash,
        })
        .from(table)
        .where(eq(table.isCurrent, true))
        .all(),
    })),
  )
  const sources = new Map<string, { bindingName: string; versionHash: string }>()
  for (const group of groups)
    for (const row of group.rows) {
      if (sources.has(row.sourceRecordId)) {
        throw new Error(
          `Multiple current Places source assertions for ${row.sourceRecordId}.`,
        )
      }
      sources.set(row.sourceRecordId, {
        bindingName: group.bindingName,
        versionHash: row.versionHash,
      })
    }
  return sources
}

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
  const includeRemovedPlaces = options.includeRemovedPlaces ?? true
  const now = options.timestamp ?? new Date().toISOString()
  const scopeId = input.snapshots.snapshotLineageId
  if (!scopeId) throw new Error('Places require a stable current scope.')
  const currentSql: string[] = []
  const currentInserts = new PlaceProjectionSql(MAX_SQL_BYTES - 4096, true)
  const referenceScope = (snapshotId: string) => {
    const scope = input.referenceScopes?.get(snapshotId)
    if (!scope)
      throw new Error(
        `Places require a complete current reference scope for snapshot ${snapshotId}.`,
      )
    return scope
  }
  const changeInserts = new PlaceProjectionSql()
  const historySqlByBinding = new Map<string, string[]>()
  const sourceSqlByBinding = new Map<string, string[]>()
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

  const publicationCounts = { localisedRows: 0, divisionLinks: 0, cells: 0 }
  let processedPlaceRows = 0
  for (const row of input.places) {
    const place = row.place
    historyStatements(input.activeHistoryBindingName).push(
      sourceResolutionSql({
        snapshotId: input.snapshots.snapshotId,
        sourceReleaseId: input.message.releaseId!,
        sourceRecordId: place.id,
        sourceVersionHash: row.sourcePayloadHash,
        resolutions: {
          entities: {
            place: [place.id],
            ...(row.divisionIds.length ? { division: row.divisionIds } : {}),
            ...(row.address2dId ? { address2d: [row.address2dId] } : {}),
            ...(row.address3dId ? { address3d: [row.address3dId] } : {}),
            ...(row.address3dUnitId ? { address3dUnit: [row.address3dUnitId] } : {}),
          },
        },
      }),
    )
    const lng = row.effectiveLng ?? place.lng
    const lat = row.effectiveLat ?? place.lat
    const previous = previousById.get(place.id)
    const unchanged = previous?.row.versionHash === row.versionHash
    const firstSeenMonth =
      typeof previous?.row.firstSeenMonth === 'string'
        ? previous.row.firstSeenMonth
        : place.firstSeenMonth
    const source = input.sourceRows?.get(place.id)
    // Each release's source API reads its assigned shard, so a year rollover
    // must materialise the payload in the new shard even when its hash matches.
    if (
      source?.bindingName !== input.activeSourceBindingName ||
      source.versionHash !== row.sourcePayloadHash
    ) {
      if (source)
        sourceStatements(source.bindingName).push(
          `UPDATE overturePlaces SET isCurrent = 0, validToRelease = ${lit(input.message.sourceVersion)}, updatedAt = ${lit(now)} WHERE sourceRecordId = ${lit(place.id)} AND isCurrent = 1${source.bindingName === input.activeSourceBindingName ? ` AND versionHash <> ${lit(row.sourcePayloadHash)}` : ''};`,
        )
      sourceStatements(input.activeSourceBindingName).push(
        insertSql(
          'overturePlaces',
          {
            sourceRecordId: place.id,
            sourceLocator: overtureSourcePayload(place.raw).sourceLocator,
            properties: overtureSourcePayload(place.raw).properties,
            sourceGeometry: overtureSourcePayload(place.raw).sourceGeometry,
            versionHash: row.sourcePayloadHash,
            releaseId: input.message.releaseId,
            validFromRelease: input.message.sourceVersion,
            validToRelease: null,
            isCurrent: 1,
            createdAt: now,
            updatedAt: now,
          },
          true,
        ),
      )
    }
    currentInserts.add('places', {
      snapshotId: scopeId,
      id: place.id,
      releaseId: unchanged ? previous.row.releaseId : input.message.releaseId,
      addressSnapshotId: row.address2dId
        ? referenceScope(row.addressSnapshotId ?? input.snapshots.addressSnapshotId)
        : null,
      address2dId: row.address2dId,
      address3dId: row.address3dId,
      address3dUnitId: row.address3dUnitId ?? null,
      address3dMembership: row.address3dMembership ?? null,
      lng,
      lat,
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
      lastSeenMonth: unchanged ? previous.row.lastSeenMonth : place.lastSeenMonth,
      createdAt: now,
      updatedAt: now,
    })
    const projectedCells =
      row.projection?.cells ??
      PLACE_H3_LEVELS.map(h3Level => ({
        h3Level,
        h3Cell: latLngToCell(lat, lng, h3Level),
      }))
    const rowScope = `snapshotId = ${lit(scopeId)}`
    currentSql.push(
      `DELETE FROM placesI18n WHERE ${rowScope} AND placeId = ${lit(place.id)}${place.i18n.length ? ` AND locale NOT IN (${place.i18n.map(row => lit(row.locale)).join(',')})` : ''};`,
    )
    currentSql.push(
      `DELETE FROM placesCells WHERE ${rowScope} AND id = ${lit(place.id)}${projectedCells.length ? ` AND NOT (${projectedCells.map(cell => `(h3Level = ${cell.h3Level} AND h3Cell = ${lit(cell.h3Cell)})`).join(' OR ')})` : ''};`,
    )
    currentSql.push(
      `DELETE FROM placesDivision WHERE placeSnapshotId = ${lit(scopeId)} AND placeId = ${lit(place.id)}${row.divisionIds.length ? ` AND NOT (divisionSnapshotId = ${lit(referenceScope(input.snapshots.divisionSnapshotId))} AND divisionId IN (${row.divisionIds.map(lit).join(',')}))` : ''};`,
    )
    for (const { h3Level, h3Cell } of projectedCells) {
      publicationCounts.cells += 1
      currentInserts.add('placesCells', {
        snapshotId: scopeId,
        id: place.id,
        h3Level,
        h3Cell,
      })
    }
    for (const [localeIndex, localised] of place.i18n.entries()) {
      const i18nVersionHash =
        row.projection?.i18nHashes[localeIndex] ??
        (await createHash({
          placeVersionHash: row.versionHash,
          locale: localised.locale,
          localised,
        }))
      publicationCounts.localisedRows += 1
      currentInserts.add('placesI18n', {
        snapshotId: scopeId,
        placeId: place.id,
        locale: localised.locale,
        name: localised.name,
        nameVariant: localised.nameVariant,
        nameAlts: localised.nameAlts,
        brandName: localised.brandName,
        brandNameVariant: localised.brandNameVariant,
        brandNameAlts: localised.brandNameAlts,
        freeformAddress: localised.freeformAddress,
        accessHint: localised.accessHint ?? null,
        provenance: localised.provenance,
        createdAt: now,
        updatedAt: now,
      })
      changeInserts.add('snapshotVersionChanges', {
        snapshotId: input.snapshots.snapshotId,
        recordType: 'placeI18n',
        recordId: place.id,
        locale: localised.locale,
        versionHash: i18nVersionHash,
        operation: 'upsert',
        sourceReleaseId: input.message.releaseId,
        createdAt: now,
        updatedAt: now,
      })
    }
    for (const divisionId of row.divisionIds) {
      publicationCounts.divisionLinks += 1
      currentInserts.add('placesDivision', {
        placeSnapshotId: scopeId,
        placeId: place.id,
        divisionSnapshotId: referenceScope(input.snapshots.divisionSnapshotId),
        divisionId,
      })
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
          address3dUnitId: row.address3dUnitId ?? null,
          address3dMembership: row.address3dMembership ?? null,
          lng,
          lat,
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
      for (const [localeIndex, localised] of place.i18n.entries()) {
        const i18nVersionHash =
          row.projection?.i18nHashes[localeIndex] ??
          (await createHash({
            placeVersionHash: row.versionHash,
            locale: localised.locale,
            localised,
          }))
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
            accessHint: localised.accessHint ?? null,
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
      changeInserts.add('snapshotVersionChanges', {
        snapshotId: input.snapshots.snapshotId,
        recordType: 'place',
        recordId: place.id,
        locale: '',
        versionHash: row.versionHash,
        operation: 'upsert',
        sourceReleaseId: input.message.releaseId,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      changeInserts.add('snapshotVersionChanges', {
        snapshotId: input.snapshots.snapshotId,
        recordType: 'place',
        recordId: place.id,
        locale: '',
        versionHash: previous.row.versionHash,
        operation: 'upsert',
        sourceReleaseId: input.message.releaseId,
        createdAt: now,
        updatedAt: now,
      })
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
      changeInserts.add('snapshotVersionChanges', {
        snapshotId: input.snapshots.snapshotId,
        recordType: 'place',
        recordId: previous.row.id,
        locale: '',
        versionHash: null,
        operation: 'delete',
        sourceReleaseId: input.message.releaseId,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  if (includeRemovedPlaces) {
    // Also close omissions on a rebuild of the same release, where releaseId
    // alone cannot distinguish retained rows from removed rows.
    const seenSourceIds =
      options.seenSourceRecordIds ?? new Set(input.places.map(row => row.place.id))
    for (const predicate of missingPlaceMembershipPredicates([...seenSourceIds]))
      currentSql.push(
        `DELETE FROM places WHERE snapshotId = ${lit(scopeId)} AND ${predicate};`,
      )
    for (const bindingName of input.sourceBindingNames)
      for (const predicate of missingSourceMembershipPredicates([...seenSourceIds]))
        sourceStatements(bindingName).push(
          `UPDATE overturePlaces SET isCurrent = 0, validToRelease = ${lit(input.message.sourceVersion)}, updatedAt = ${lit(now)} WHERE isCurrent = 1 AND ${predicate};`,
        )
  }

  return {
    publicationCounts,
    currentSql: [...currentSql, ...currentInserts.finish()],
    historySqlByBinding,
    sourceSqlByBinding,
    changes: changeInserts.finish(),
  }
}

function missingPlaceMembershipPredicates(ids: string[]) {
  const sorted = [...new Set(ids)].sort((a, b) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  )
  if (!sorted.length) return ['1 = 1']
  const predicates: string[] = []
  for (let offset = 0; offset < sorted.length; offset += 96) {
    const batch = sorted.slice(offset, offset + 96)
    const first = batch[0]!
    const next = sorted[offset + 96]
    predicates.push(
      [
        ...(offset ? [`id >= ${lit(first)}`] : []),
        ...(next === undefined ? [] : [`id < ${lit(next)}`]),
        `id NOT IN (${batch.map(lit).join(',')})`,
      ].join(' AND '),
    )
  }
  return predicates
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
  yield await buildPlaceSql(
    { ...input, historyRows: removedHistoryRows, places: [] },
    {
      includeInitialStatements: !yielded,
      includeRemovedPlaces: true,
      seenSourceRecordIds: seen,
      timestamp,
    },
  )
}
