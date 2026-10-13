import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { historyVersionSelection } from '@repo/core/pipeline/db/snapshotReplay'
import { readSourceAttributions } from '@repo/core/pipeline/services/sources/sourceAttribution'
import { resolveStatisticEvents } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords'
import type { currentSchema, HistoryContent } from '@repo/db'
import { and, eq, historySchema } from '@repo/db'
import type { LandsdStreetMaterialisedStreet } from '../../sources/hkgov/landsd/street/landsdStreetLifecycle'

type Street = HistoryContent<
  typeof historySchema.streets.$inferSelect,
  typeof currentSchema.streets.$inferSelect
>
type Locale = HistoryContent<
  typeof historySchema.streetsI18n.$inferSelect,
  typeof currentSchema.streetsI18n.$inferSelect
>
type Changelog = HistoryContent<
  typeof historySchema.streetChangelog.$inferSelect,
  typeof currentSchema.streetChangelog.$inferSelect
>

export async function readStreetSnapshot(
  metaDb: HarbourReadableDb,
  historyDbs: HarbourReadableDb[],
  snapshotId: string | null,
) {
  const streets: Street[] = [],
    locales: Locale[] = [],
    changelog: Changelog[] = []
  const plan = snapshotId ? await resolveSnapshotReplayPlan(metaDb, snapshotId) : []
  const groups = await resolveStatisticEvents(
    historyDbs,
    plan.map(step => step.snapshotId),
    ['street', 'streetI18n', 'streetChangelog'],
  )
  for (const [db, events] of groups) {
    for (const [type, table, output] of [
      ['street', historySchema.streets, streets],
      ['streetI18n', historySchema.streetsI18n, locales],
      ['streetChangelog', historySchema.streetChangelog, changelog],
    ] as const) {
      const selected = events.filter(event => event.recordType === type)
      for (let offset = 0; offset < selected.length; offset += 256) {
        const rows = await db
          .select()
          .from(table)
          .where(historyVersionSelection(table, selected.slice(offset, offset + 256)))
          .all()
        ;(output as unknown[]).push(...rows)
      }
    }
  }
  const materialised: LandsdStreetMaterialisedStreet[] = streets.map(row => ({
    id: row.id,
    deletedAt: row.deletedAt,
    districtIds: Array.isArray(row.districtIds) ? row.districtIds : [],
    gazetteDate: row.gazetteDate,
    sources: readSourceAttributions(row.sources),
    status: 'active',
    version: row.version,
    i18n: locales
      .filter(
        locale =>
          locale.streetId === row.id &&
          (locale.locale === 'en' || locale.locale === 'zh-Hant'),
      )
      .map(locale => ({
        locale: locale.locale as 'en' | 'zh-Hant',
        name: locale.name,
        description: locale.description,
      })),
  }))
  const deleted = new Map<string, LandsdStreetMaterialisedStreet>()
  const activeIds = new Set(materialised.map(row => row.id))
  for (const step of plan) {
    for (const db of historyDbs) {
      const rows = (await db
        .select()
        .from(historySchema.streets)
        .where(
          and(
            eq(historySchema.streets.snapshotId, step.snapshotId),
            eq(historySchema.streets.operation, 'delete'),
          ),
        )
        .all()) as Array<typeof historySchema.streets.$inferSelect>
      if (!rows.length) continue
      const names = (await db
        .select()
        .from(historySchema.streetsI18n)
        .where(
          and(
            eq(historySchema.streetsI18n.snapshotId, step.snapshotId),
            eq(historySchema.streetsI18n.operation, 'delete'),
          ),
        )
        .all()) as Array<typeof historySchema.streetsI18n.$inferSelect>
      for (const row of rows) {
        if (activeIds.has(row.id)) continue
        if (row.version === null)
          throw new Error(
            `Street deletion ${row.id} in ${step.snapshotId} lacks its lifecycle version.`,
          )
        deleted.set(row.id, {
          id: row.id,
          status: 'deleted',
          version: row.version,
          deletedAt: row.deletedAt,
          gazetteDate: row.gazetteDate,
          districtIds: Array.isArray(row.districtIds) ? row.districtIds : [],
          sources: readSourceAttributions(row.sources),
          i18n: names
            .filter(
              name =>
                name.streetId === row.id &&
                name.name !== null &&
                (name.locale === 'en' || name.locale === 'zh-Hant'),
            )
            .map(name => ({
              locale: name.locale as 'en' | 'zh-Hant',
              name: name.name!,
              description: name.description,
            })),
        })
      }
    }
  }
  return {
    streets: materialised,
    lifecycleStreets: [...materialised, ...deleted.values()],
    locales,
    changelog,
  }
}
