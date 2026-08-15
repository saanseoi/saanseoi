import { command, getRequestEvent } from '$app/server'
import { z } from 'zod'

import { createApiKey } from '#lib/server/apiKeys.js'

const createApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Choose a name between 1 and 64 characters.')
    .max(64, 'Choose a name between 1 and 64 characters.'),
})

const getIdentity = () => {
  const event = getRequestEvent()
  const userId = event.locals.user?.id
  const binding = event.platform?.env.DB_META

  if (!userId || !binding) return null

  return { binding, userId }
}

export const createGuideApiKey = command(createApiKeySchema, async ({ name }) => {
  const identity = getIdentity()
  if (!identity) throw new Error('You must be signed in to create an API key.')

  return createApiKey(identity.binding, identity.userId, name)
})
