import { command, getRequestEvent } from '$app/server'
import { createMetaDb, eq, user as userTable, userLocales } from '@repo/db'
import { z } from 'zod'

const localeSchema = z.enum(userLocales)

export const setUserLocale = command(localeSchema, async locale => {
  const event = getRequestEvent()
  const userId = event.locals.user?.id
  const binding = event.platform?.env.DB_META

  if (!userId || !binding) return

  await createMetaDb(binding)
    .update(userTable)
    .set({ locale })
    .where(eq(userTable.id, userId))
})
