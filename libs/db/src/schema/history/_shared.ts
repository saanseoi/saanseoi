import { integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const jsonText = (name: string) => text(name, { mode: 'json' })

export const versioning = {
  versionHash: text('versionHash').notNull(),
  sourceReleaseId: text('sourceReleaseId').notNull(),
  snapshotId: text('snapshotId').notNull(),
  validFromSnapshotId: text('validFromSnapshotId').notNull(),
  validToSnapshotId: text('validToSnapshotId'),
  validFromMonth: text('validFromMonth').notNull(),
  validToMonth: text('validToMonth'),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
}

export const i18nVersioning = {
  versionHash: text('versionHash').notNull(),
  sourceReleaseId: text('sourceReleaseId').notNull(),
  snapshotId: text('snapshotId').notNull(),
  validFromSnapshotId: text('validFromSnapshotId').notNull(),
  validToSnapshotId: text('validToSnapshotId'),
  isCurrent: integer('isCurrent', { mode: 'boolean' }).notNull(),
}

export const timestamps = {
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  updatedAt: text('updatedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => /* @__PURE__ */ new Date().toISOString())
    .notNull(),
}
