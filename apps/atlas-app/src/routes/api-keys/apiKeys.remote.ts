import { redirect } from '@sveltejs/kit'
import { command, getRequestEvent, query } from '$app/server'
import { z } from 'zod'

import { createApiKey, listApiKeys, revokeApiKey } from '$lib/server/apiKeys'

const createApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Choose a name between 1 and 64 characters.')
    .max(64, 'Choose a name between 1 and 64 characters.'),
})

const revokeApiKeySchema = z.object({
  id: z.string().min(1),
})

const getIdentity = () => {
  const event = getRequestEvent()
  const userId = event.locals.user?.id
  const binding = event.platform?.env.DB_META

  if (!userId) redirect(303, '/sign-in?next=/api-keys')
  if (!binding) throw new Error('D1 binding "DB_META" not found.')

  return { binding, userId }
}

export const getApiKeysPageData = query(async () => {
  const { binding, userId } = getIdentity()

  return listApiKeys(binding, userId)
})

export const createApiKeyForCurrentUser = command(
  createApiKeySchema,
  async ({ name }) => {
    const { binding, userId } = getIdentity()
    const key = await createApiKey(binding, userId, name)

    await getApiKeysPageData().refresh()
    return key
  },
)

export const revokeApiKeyForCurrentUser = command(
  revokeApiKeySchema,
  async ({ id }) => {
    const { binding, userId } = getIdentity()

    await revokeApiKey(binding, userId, id)
    await getApiKeysPageData().refresh()
  },
)
