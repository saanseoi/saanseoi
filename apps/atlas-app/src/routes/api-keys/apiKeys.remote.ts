import { redirect } from '@sveltejs/kit'
import { command, getRequestEvent, query } from '$app/server'
import { z } from 'zod'

import { createApiKey, listApiKeys, revokeApiKey } from '#lib/server/apiKeys.js'
import { writeServerProductUsage } from '#lib/analytics/productUsage.js'

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
    try {
      const key = await createApiKey(binding, userId, name)

      await getApiKeysPageData().refresh()
      writeServerProductUsage({
        event: 'api_key.create',
        surface: 'api_keys',
        entityType: 'key_action',
        entityId: 'create',
      })
      return key
    } catch (error) {
      writeServerProductUsage({
        event: 'api_key.create',
        surface: 'api_keys',
        entityType: 'key_action',
        entityId: 'create',
        outcome: 'failure',
      })
      throw error
    }
  },
)

export const revokeApiKeyForCurrentUser = command(
  revokeApiKeySchema,
  async ({ id }) => {
    const { binding, userId } = getIdentity()

    try {
      await revokeApiKey(binding, userId, id)
      await getApiKeysPageData().refresh()
      writeServerProductUsage({
        event: 'api_key.revoke',
        surface: 'api_keys',
        entityType: 'key_action',
        entityId: 'revoke',
      })
    } catch (error) {
      writeServerProductUsage({
        event: 'api_key.revoke',
        surface: 'api_keys',
        entityType: 'key_action',
        entityId: 'revoke',
        outcome: 'failure',
      })
      throw error
    }
  },
)
