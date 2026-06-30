import type { MetaDatabase } from '@repo/db'
import { eq, metaSchema } from '@repo/db'

const { newsletterSubscription, user } = metaSchema

export async function markNewsletterPending(db: MetaDatabase, email: string) {
  const updatedAt = new Date()

  await db
    .insert(newsletterSubscription)
    .values({
      email,
      status: 'pending',
      lastError: null,
      subscribedAt: null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: newsletterSubscription.email,
      set: {
        status: 'pending',
        lastError: null,
        subscribedAt: null,
        updatedAt,
      },
    })

  await syncUserSubstackStatus(db, email, 'pending')
}

export async function markNewsletterSubscribed(db: MetaDatabase, email: string) {
  const updatedAt = new Date()

  await db
    .insert(newsletterSubscription)
    .values({
      email,
      status: 'subscribed',
      lastError: null,
      subscribedAt: updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: newsletterSubscription.email,
      set: {
        status: 'subscribed',
        lastError: null,
        subscribedAt: updatedAt,
        updatedAt,
      },
    })

  await syncUserSubstackStatus(db, email, 'subscribed')
}

export async function markNewsletterFailed(
  db: MetaDatabase,
  email: string,
  lastError: string,
) {
  const updatedAt = new Date()

  await db
    .insert(newsletterSubscription)
    .values({
      email,
      status: 'failed',
      lastError,
      subscribedAt: null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: newsletterSubscription.email,
      set: {
        status: 'failed',
        lastError,
        subscribedAt: null,
        updatedAt,
      },
    })

  await syncUserSubstackStatus(db, email, 'failed')
}

async function syncUserSubstackStatus(
  db: MetaDatabase,
  email: string,
  status: 'failed' | 'pending' | 'subscribed' | 'unsubscribed',
) {
  await db
    .update(user)
    .set({ substack: status, updatedAt: new Date() })
    .where(eq(user.email, email))
}
