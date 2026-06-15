import { sql } from 'drizzle-orm'
import { text } from 'drizzle-orm/sqlite-core'

export const jsonText = (name: string) => text(name, { mode: 'json' })

export const timestamps = {
  createdAt: text('createdAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .notNull(),
  updatedAt: text('updatedAt')
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
    .$onUpdate(() => /* @__PURE__ */ new Date().toISOString())
    .notNull(),
}
