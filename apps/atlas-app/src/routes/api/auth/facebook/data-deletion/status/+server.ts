import type { RequestHandler } from '@sveltejs/kit'
import { eq } from '@repo/db'
import { createMetaDb } from '@repo/db/client'
import { facebookDeletionRequest } from '@repo/db'
import { hashFacebookDeletionConfirmationCode } from '#lib/server/facebook-data-deletion.js'

/** Reports the status of a completed Meta Facebook deletion callback. */
export const GET: RequestHandler = async ({ platform, url }) => {
  const confirmationCode = url.searchParams.get('code')
  const database = platform?.env.DB_META
  if (!confirmationCode || !database) {
    return Response.json({ status: 'unknown', confirmation_code: confirmationCode })
  }

  const db = createMetaDb(database)
  const completedRequest = await db
    .select({
      confirmationCodeHash: facebookDeletionRequest.confirmationCodeHash,
    })
    .from(facebookDeletionRequest)
    .where(
      eq(
        facebookDeletionRequest.confirmationCodeHash,
        await hashFacebookDeletionConfirmationCode(confirmationCode),
      ),
    )
    .limit(1)

  return Response.json({
    status: completedRequest.length ? 'completed' : 'unknown',
    confirmation_code: confirmationCode,
  })
}
