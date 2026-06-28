import { createMetaDb } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'

export function withPrimarySession<TBinding>(binding: TBinding): TBinding {
  if (
    binding &&
    typeof binding === 'object' &&
    'withSession' in binding &&
    typeof binding.withSession === 'function'
  ) {
    return binding.withSession('first-primary') as TBinding
  }

  return binding
}

export function createPrimaryMetaRepoDb(
  binding: D1Database,
): HarbourReadableDb & HarbourWritableDb {
  return createMetaDb(withPrimarySession(binding)) as unknown as HarbourReadableDb &
    HarbourWritableDb
}
