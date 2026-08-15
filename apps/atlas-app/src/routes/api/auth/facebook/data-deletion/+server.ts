import { error, type RequestHandler } from '@sveltejs/kit'
import { and, eq } from '@repo/db'
import { createMetaDb } from '@repo/db/client'
import {
  account,
  facebookDeletionRequest,
  newsletterSubscription,
  passkey,
  user,
} from '@repo/db'
import {
  createFacebookDeletionConfirmationCode,
  hashFacebookDeletionConfirmationCode,
  parseFacebookSignedRequest,
} from '#lib/server/facebook-data-deletion.js'

/**
 * Handles Meta's Facebook user-data deletion callback.
 *
 * If another sign-in method remains, only the Facebook account link and its
 * provider tokens are removed. Otherwise the atlas account and its dependent
 * API credentials are deleted.
 */
export const POST: RequestHandler = async ({ platform, request, url }) => {
  const database = platform?.env.DB_META
  const appSecret = platform?.env.FACEBOOK_CLIENT_SECRET
  if (!database || !appSecret) throw error(503, 'FACEBOOK_DELETION_UNAVAILABLE')

  const form = await request.formData()
  const signedRequest = form.get('signed_request')
  if (typeof signedRequest !== 'string') throw error(400, 'INVALID_SIGNED_REQUEST')

  const payload = await parseFacebookSignedRequest(signedRequest, appSecret)
  if (!payload) throw error(400, 'INVALID_SIGNED_REQUEST')

  const db = createMetaDb(database)
  const [matchingAccount] = await db
    .select({ id: account.id, userId: account.userId })
    .from(account)
    .where(
      and(eq(account.providerId, 'facebook'), eq(account.accountId, payload.user_id)),
    )
    .limit(1)

  if (matchingAccount) {
    await db.transaction(async tx => {
      const [linkedAccounts, registeredPasskey, existingUser] = await Promise.all([
        tx
          .select({ id: account.id })
          .from(account)
          .where(eq(account.userId, matchingAccount.userId)),
        tx
          .select({ id: passkey.id })
          .from(passkey)
          .where(eq(passkey.userId, matchingAccount.userId))
          .limit(1),
        tx
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, matchingAccount.userId))
          .limit(1),
      ])
      const [matchedUser] = existingUser

      const hasAnotherSignInMethod =
        linkedAccounts.some(account => account.id !== matchingAccount.id) ||
        registeredPasskey.length > 0

      if (hasAnotherSignInMethod || !matchedUser) {
        await tx.delete(account).where(eq(account.id, matchingAccount.id))
        return
      }

      await tx
        .delete(newsletterSubscription)
        .where(eq(newsletterSubscription.email, matchedUser.email))
      await tx.delete(user).where(eq(user.id, matchingAccount.userId))
    })
  }

  const confirmationCode = await createFacebookDeletionConfirmationCode(
    appSecret,
    payload.user_id,
  )
  await db
    .insert(facebookDeletionRequest)
    .values({
      confirmationCodeHash:
        await hashFacebookDeletionConfirmationCode(confirmationCode),
    })
    .onConflictDoNothing()

  return Response.json({
    url: `${url.origin}/api/auth/facebook/data-deletion/status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  })
}
