import { createDb } from '@repo/db'

export const createHarbourDb = createDb

export type HarbourDb = ReturnType<typeof createHarbourDb>
