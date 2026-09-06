import {
  and,
  currentSchema,
  desc,
  eq,
  historySchema,
  inArray,
  metaDataShards,
  metaSnapshotLineages,
  metaSnapshotShardAssignments,
  metaSnapshots,
} from '@repo/db'
import { query } from '$app/server'
import { z } from 'zod'

import { getCurrentDb, getHistoryDb, getMetaDb, recordRegistryDataLoad } from './server'

const DISTRICT_COVERAGE_MAP_VARIANT = 'hkgov-censtatd-landclipped:simplified'
const districtMapLocaleSchema = z.enum(['en', 'zh-Hant', 'zh-Hans'])
const districtGeometryNamesSchema = z.object({
  districtIds: z.array(z.string().trim().min(1).max(200)).max(100),
  locale: districtMapLocaleSchema,
})
const D1_DISTRICT_NAME_BATCH_SIZE = 98
const UNOFFICIAL_DISTRICT_IDS = new Set([
  // Overture's Lok Ma Chau Loop is a named geographic area, not an official
  // Hong Kong district. Its localised names remain canonical division data.
  '222b7818-970a-491d-98b6-b88d8c6f0161',
])

/**
 * The district-coverage map prefers the C&SD 2021 Census District Boundary's
 * simplified display geometry. Its immutable snapshot can live in a history
 * shard, so resolve the published snapshot and read its assigned shard rather
 * than substituting Overture geometry.
 */
export const getDistrictCoverageMapData = query(
  districtMapLocaleSchema,
  async locale => {
    const { divisionAreas, divisionsI18n } = currentSchema
    const i18nLocale = locale.toLowerCase()
    const selectCurrentDistrictAreas = () =>
      getCurrentDb()
        .select({
          divisionId: divisionAreas.divisionId,
          geometry: divisionAreas.geometry,
          updatedAt: divisionAreas.updatedAt,
          variant: divisionAreas.variant,
        })
        .from(divisionAreas)
        .where(eq(divisionAreas.variant, DISTRICT_COVERAGE_MAP_VARIANT))
        .orderBy(desc(divisionAreas.updatedAt))
        .all()
    const currentRows = await selectCurrentDistrictAreas()
    const snapshot =
      currentRows.length > 0
        ? null
        : await getMetaDb()
            .select({
              bindingName: metaDataShards.bindingName,
              snapshotId: metaSnapshots.id,
            })
            .from(metaSnapshots)
            .innerJoin(
              metaSnapshotLineages,
              eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
            )
            .innerJoin(
              metaSnapshotShardAssignments,
              eq(metaSnapshots.id, metaSnapshotShardAssignments.snapshotId),
            )
            .innerJoin(
              metaDataShards,
              eq(metaSnapshotShardAssignments.dataShardId, metaDataShards.id),
            )
            .where(
              and(
                eq(metaSnapshots.resourceType, 'divisionArea'),
                eq(metaSnapshots.status, 'published'),
                eq(metaSnapshotLineages.variant, DISTRICT_COVERAGE_MAP_VARIANT),
              ),
            )
            .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
            .limit(1)
            .get()
    const rows =
      currentRows.length > 0
        ? currentRows
        : snapshot
          ? await getHistoryDb(snapshot.bindingName)
              .select({
                divisionId: historySchema.divisionAreas.divisionId,
                geometry: historySchema.divisionAreas.geometry,
                updatedAt: historySchema.divisionAreas.updatedAt,
                variant: historySchema.divisionAreas.variant,
              })
              .from(historySchema.divisionAreas)
              .where(eq(historySchema.divisionAreas.snapshotId, snapshot.snapshotId))
              .orderBy(desc(historySchema.divisionAreas.updatedAt))
              .all()
          : []

    const latestByDistrict = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!latestByDistrict.has(row.divisionId))
        latestByDistrict.set(row.divisionId, row)
    }

    const districtIds = [...latestByDistrict.keys()]
    const i18nRows = districtIds.length
      ? await getCurrentDb()
          .select({
            divisionId: divisionsI18n.divisionId,
            locale: divisionsI18n.locale,
            name: divisionsI18n.name,
          })
          .from(divisionsI18n)
          .where(
            and(
              inArray(divisionsI18n.locale, [i18nLocale, 'en']),
              inArray(divisionsI18n.divisionId, districtIds),
            ),
          )
          .orderBy(desc(divisionsI18n.updatedAt))
          .all()
      : []
    const nameByLocale = new Map<string, Map<string, string>>()
    for (const row of i18nRows) {
      if (!row.name) continue
      const names = nameByLocale.get(row.locale) ?? new Map<string, string>()
      if (!names.has(row.divisionId)) {
        names.set(row.divisionId, row.name)
      }
      nameByLocale.set(row.locale, names)
    }
    const localisedNames = nameByLocale.get(i18nLocale)
    const englishNames = nameByLocale.get('en')

    return [...latestByDistrict.values()].map(row => ({
      ...row,
      name:
        localisedNames?.get(row.divisionId) ??
        englishNames?.get(row.divisionId) ??
        null,
    }))
  },
)

/**
 * Resolves names for district geometry statistics. This intentionally uses
 * canonical division localisations instead of display geometry, because a
 * release can contain a district that is not part of the official C&SD map.
 */
export const getDistrictGeometryNames = query(
  districtGeometryNamesSchema,
  async ({ districtIds, locale }) => {
    const ids = [...new Set(districtIds)]
    if (!ids.length) return []

    const i18nLocale = locale.toLowerCase()
    const { divisionsI18n } = currentSchema
    const rows = (
      await Promise.all(
        Array.from(
          { length: Math.ceil(ids.length / D1_DISTRICT_NAME_BATCH_SIZE) },
          (_, index) =>
            getCurrentDb()
              .select({
                divisionId: divisionsI18n.divisionId,
                locale: divisionsI18n.locale,
                name: divisionsI18n.name,
                updatedAt: divisionsI18n.updatedAt,
              })
              .from(divisionsI18n)
              .where(
                and(
                  inArray(divisionsI18n.locale, [i18nLocale, 'en']),
                  inArray(
                    divisionsI18n.divisionId,
                    ids.slice(
                      index * D1_DISTRICT_NAME_BATCH_SIZE,
                      (index + 1) * D1_DISTRICT_NAME_BATCH_SIZE,
                    ),
                  ),
                ),
              )
              .orderBy(desc(divisionsI18n.updatedAt))
              .all(),
        ),
      )
    ).flat()

    const namesByLocale = new Map<string, Map<string, string>>()
    for (const row of rows) {
      if (!row.name) continue
      const names = namesByLocale.get(row.locale) ?? new Map<string, string>()
      if (!names.has(row.divisionId)) names.set(row.divisionId, row.name)
      namesByLocale.set(row.locale, names)
    }
    const localisedNames = namesByLocale.get(i18nLocale)
    const englishNames = namesByLocale.get('en')

    const result = ids.map(divisionId => ({
      divisionId,
      name: localisedNames?.get(divisionId) ?? englishNames?.get(divisionId) ?? null,
      unofficial: UNOFFICIAL_DISTRICT_IDS.has(divisionId),
    }))
    recordRegistryDataLoad('/sources/:id/:id', 'district')
    return result
  },
)
