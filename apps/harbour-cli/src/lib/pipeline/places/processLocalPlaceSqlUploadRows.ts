import type { HarbourReadableDb } from '@repo/core/db/types'
import { publisherPlaceId } from '@repo/core/pipeline/services/places/place'
import { normaliseOvertureAttribution } from '@repo/core/pipeline/services/sources/sourceAttribution'
import { overtureSourcePayload } from '@repo/core/pipeline/services/sources/sourcePayload'
import { prepareRecordEvidence } from '@repo/core/provenance'
import { sourceSchema } from '@repo/db'
import { eq } from 'drizzle-orm'
import { latLngToCell } from 'h3-js'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import {
  canonicalPlaceJson,
  placeHistoryInsertSql,
  placeLocaleHash,
  reusePlaceLocaleDependencies,
} from './placeHistory.ts'
import { PlaceProjectionSql } from './placeProjectionSql.ts'
import {
  MAX_SQL_BYTES,
  PLACE_H3_LEVELS,
  PLACE_SQL_BATCH_SIZE,
} from './processLocalPlaceSqlUploadConfig.ts'
import { insertSql, lit } from './processLocalPlaceSqlUploadImport.ts'
import { readStagedJsonBatches } from './processLocalPlaceSqlUploadPreparation.ts'
import type {
  BuildPlaceSqlInput,
  BuildPlaceSqlOptions,
  EnrichedPlace,
  PlaceHistoryState,
  PlaceSqlProgressEvent,
} from './processLocalPlaceSqlUploadTypes.ts'

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

export { loadCurrentPlaceHistory } from './placeHistoryBaseline.ts'

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

  const retireLocale = (state: NonNullable<PlaceHistoryState['locales']>[number]) => {
    changeInserts.addDeletion({
      snapshotId: input.snapshots.snapshotId,
      recordType: 'placeI18n',
      recordId: state.row.placeId,
      locale: state.row.locale,
      versionHash: null,
      operation: 'delete',
      sourceReleaseId: input.message.resourceReleaseId,
      createdAt: now,
    })
  }

  const evidenceDocuments: unknown[] = []
  const publicationCounts = { localisedRows: 0, divisionLinks: 0, cells: 0 }
  let processedPlaceRows = 0
  for (const row of input.places) {
    const place = row.place
    const sourceId = publisherPlaceId(place)
    const resolvedSources = normaliseOvertureAttribution(place.sources.overture)
    const retained = await prepareRecordEvidence('places', place.id, {
      ...(place.sources.placeIdentity
        ? { placeIdentity: place.sources.placeIdentity }
        : {}),
      ...(row.divisionAssociation
        ? { divisionAssociation: row.divisionAssociation }
        : {}),
    })
    evidenceDocuments.push(retained.document)
    const lng = row.effectiveLng ?? place.lng
    const lat = row.effectiveLat ?? place.lat
    const previous = previousById.get(place.id)
    const unchanged = previous?.row.versionHash === row.versionHash
    const previousLocales = new Map(
      previous?.locales?.map(state => [state.row.locale, state]) ?? [],
    )
    const addressSnapshotId = row.address2dId
      ? previous?.row.address2dId === row.address2dId &&
        previous.row.addressDependencyHash === row.addressDependencyHash
        ? previous.row.addressSnapshotId
        : (row.addressSnapshotId ?? input.snapshots.addressSnapshotId)
      : null
    const firstSeenMonth =
      typeof previous?.row.firstSeenMonth === 'string'
        ? previous.row.firstSeenMonth
        : place.firstSeenMonth
    const source = input.sourceRows?.get(sourceId)
    // A release is assigned every source shard that contains one of its
    // retained assertions. An unchanged assertion therefore remains owned by
    // its original shard across a year boundary; only a changed, new or
    // returning assertion needs a write in the active shard.
    if (!source || source.versionHash !== row.sourcePayloadHash) {
      if (source)
        sourceStatements(source.bindingName).push(
          `UPDATE overturePlaces SET isCurrent = 0, validToRelease = ${lit(input.message.sourceVersion)}, updatedAt = ${lit(now)} WHERE sourceRecordId = ${lit(sourceId)} AND isCurrent = 1${source.bindingName === input.activeSourceBindingName ? ` AND versionHash <> ${lit(row.sourcePayloadHash)}` : ''};`,
        )
      sourceStatements(input.activeSourceBindingName).push(
        insertSql(
          'overturePlaces',
          {
            sourceRecordId: sourceId,
            properties: overtureSourcePayload(place.raw).properties,
            sourceGeometry: overtureSourcePayload(place.raw).sourceGeometry,
            versionHash: row.sourcePayloadHash,
            resourceReleaseId: input.message.resourceReleaseId,
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
      scopeId,
      id: place.id,
      resourceReleaseId: unchanged
        ? previous.row.resourceReleaseId
        : input.message.resourceReleaseId,
      addressSnapshotId,
      addressDependencyHash: row.addressDependencyHash ?? null,
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
      sources: unchanged ? (previous.row.sources ?? resolvedSources) : resolvedSources,
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
    const rowScope = `scopeId = ${lit(scopeId)}`
    currentSql.push(
      `DELETE FROM placesI18n WHERE ${rowScope} AND placeId = ${lit(place.id)}${place.i18n.length ? ` AND locale NOT IN (${place.i18n.map(row => lit(row.locale)).join(',')})` : ''};`,
    )
    currentSql.push(
      `DELETE FROM placesCells WHERE ${rowScope} AND id = ${lit(place.id)}${projectedCells.length ? ` AND NOT (${projectedCells.map(cell => `(h3Level = ${cell.h3Level} AND h3Cell = ${lit(cell.h3Cell)})`).join(' OR ')})` : ''};`,
    )
    currentSql.push(
      `DELETE FROM placesDivision WHERE placeScopeId = ${lit(scopeId)} AND placeId = ${lit(place.id)}${row.divisionIds.length ? ` AND divisionId NOT IN (${row.divisionIds.map(lit).join(',')})` : ''};`,
    )
    for (const { h3Level, h3Cell } of projectedCells) {
      publicationCounts.cells += 1
      currentInserts.add('placesCells', {
        scopeId,
        id: place.id,
        h3Level,
        h3Cell,
      })
    }
    for (const [localeIndex, localised] of place.i18n.entries()) {
      const previousLocale = previousLocales.get(localised.locale)
      const searchDependencyText = reusePlaceLocaleDependencies(
        row.searchDependencies?.[localised.locale],
        previousLocale?.row.searchDependencyText,
      )
      const i18nVersionHash =
        row.projection?.i18nHashes[localeIndex] ??
        (await placeLocaleHash(localised, searchDependencyText))
      publicationCounts.localisedRows += 1
      currentInserts.add('placesI18n', {
        scopeId,
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
        searchDependencyText,
        createdAt: now,
        updatedAt: now,
      })
      if (previousLocale?.row.versionHash !== i18nVersionHash) {
        historyStatements(input.activeHistoryBindingName).push(
          placeHistoryInsertSql(
            'placesI18n',
            {
              placeId: place.id,
              ...localised,
              accessHint: localised.accessHint ?? null,
              searchDependencyText,
              versionHash: i18nVersionHash,
              sourceReleaseId: input.message.resourceReleaseId,
              snapshotId: input.snapshots.snapshotId,
              isCurrent: 1,
              createdAt: now,
            },
            now,
          ),
        )
      }
    }
    for (const previousLocale of previousLocales.values()) {
      if (place.i18n.some(row => row.locale === previousLocale.row.locale)) continue
      retireLocale(previousLocale)
    }
    const previousDivisions = new Map(
      previous?.divisionLinks?.map(link => [link.divisionId, link]),
    )
    for (const divisionId of [...new Set(row.divisionIds)].sort()) {
      const candidate = row.divisionDefinitions?.[divisionId]
      if (!candidate)
        throw new Error(
          `Missing exact Place Division definition ${place.id}/${divisionId}.`,
        )
      const definition = {
        level: candidate.level,
        locales: [...candidate.locales].sort((a, b) =>
          a.locale.localeCompare(b.locale),
        ),
      }
      const previousDivision = previousDivisions.get(divisionId)
      const divisionSnapshotId =
        previousDivision &&
        canonicalPlaceJson(previousDivision.definition) ===
          canonicalPlaceJson(definition)
          ? previousDivision.divisionSnapshotId
          : input.snapshots.divisionSnapshotId
      publicationCounts.divisionLinks += 1
      currentInserts.add('placesDivision', {
        placeScopeId: scopeId,
        placeId: place.id,
        divisionSnapshotId,
        divisionId,
        definition,
      })
    }

    if (previous?.row.versionHash !== row.versionHash) {
      historyStatements(input.activeHistoryBindingName).push(
        placeHistoryInsertSql(
          'places',
          {
            id: place.id,
            resourceReleaseId: input.message.resourceReleaseId,
            addressSnapshotId,
            addressDependencyHash: row.addressDependencyHash ?? null,
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
            sources: resolvedSources,
            firstSeenMonth,
            lastSeenMonth: place.lastSeenMonth,
            versionHash: row.versionHash,
            sourceReleaseId: input.message.resourceReleaseId,
            snapshotId: input.snapshots.snapshotId,
            isCurrent: 1,
            createdAt: now,
          },
          now,
        ),
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
      for (const locale of previous.locales ?? []) retireLocale(locale)
      changeInserts.addDeletion({
        snapshotId: input.snapshots.snapshotId,
        recordType: 'place',
        recordId: previous.row.id,
        locale: '',
        versionHash: null,
        operation: 'delete',
        sourceReleaseId: input.message.resourceReleaseId,
        createdAt: now,
      })
    }
  }

  if (includeRemovedPlaces) {
    // Also close omissions on a rebuild of the same release, where resourceReleaseId
    // alone cannot distinguish retained rows from removed rows.
    const seenSourceIds =
      options.seenSourceRecordIds ??
      new Set(input.places.map(row => publisherPlaceId(row.place)))
    for (const predicate of missingPlaceMembershipPredicates([
      ...(options.seenPlaceIds ?? new Set(input.places.map(row => row.place.id))),
    ]))
      currentSql.push(
        `DELETE FROM places WHERE scopeId = ${lit(scopeId)} AND ${predicate};`,
      )
    for (const sourceRecordId of input.sourceRows?.keys() ?? []) {
      if (seenSourceIds.has(sourceRecordId)) continue
      const source = input.sourceRows?.get(sourceRecordId)
      if (source)
        sourceStatements(source.bindingName).push(
          `UPDATE overturePlaces SET isCurrent = 0, validToRelease = ${lit(input.message.sourceVersion)}, updatedAt = ${lit(now)} WHERE sourceRecordId = ${lit(sourceRecordId)} AND versionHash = ${lit(source.versionHash)} AND isCurrent = 1;`,
        )
    }
  }

  return {
    evidenceDocuments,
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
    const first = batch[0]
    if (!first) throw new Error('Place membership predicate batch is empty.')
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
  const seenSources = new Set<string>()
  let processedRows = 0

  for await (const places of readStagedJsonBatches<EnrichedPlace>(
    path,
    PLACE_SQL_BATCH_SIZE,
  )) {
    const historyRows: PlaceHistoryState[] = []
    for (const place of places) {
      const placeId = place.place.id
      seen.add(placeId)
      seenSources.add(publisherPlaceId(place.place))
      const previous = historyById.get(placeId)
      if (previous) historyRows.push(previous)
    }

    yield await buildPlaceSql(
      { ...input, historyRows, places },
      {
        includeRemovedPlaces: false,
        onProgress: current =>
          onProgress?.({ current: processedRows + current, phase: 'generate' }),
        timestamp,
      },
    )
    processedRows += places.length
  }

  const removedHistoryRows = input.historyRows.filter(
    state => !seen.has(String(state.row.id)),
  )
  yield await buildPlaceSql(
    { ...input, historyRows: removedHistoryRows, places: [] },
    {
      includeRemovedPlaces: true,
      seenSourceRecordIds: seenSources,
      seenPlaceIds: seen,
      timestamp,
    },
  )
}
