import { createAuthClient } from 'better-auth/client'
import { oneTapClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

export const authClient = createAuthClient({
  plugins: [passkeyClient()],
})

export const createGoogleOneTapClient = (clientId: string) =>
  createAuthClient({
    plugins: [oneTapClient({ clientId, promptOptions: { fedCM: true } })],
  })
