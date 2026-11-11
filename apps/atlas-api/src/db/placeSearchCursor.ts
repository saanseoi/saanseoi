import { z } from 'zod'

const cursorSchema = z.strictObject({
  key: z.string(),
  rowid: z.number().int().nonnegative(),
})
export type PlaceSearchCursor = z.infer<typeof cursorSchema>
export class PlaceSearchExpiredError extends Error {}

/** Bind a continuation to its query, filters and exact published index generation.
 * @param value Ranking inputs and publication readiness evidence.
 * @returns A compact identity shared by pages of the same search.
 */
export async function placeSearchKey(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
/** Validate an opaque continuation before using its bound row identifier.
 * @param value Cursor returned with the preceding page.
 * @param key Current query and publication identity.
 * @returns The next stable scan position.
 * @remarks A changed query or publication requires an explicit fresh search.
 */
export function readPlaceSearchCursor(
  value: string | undefined,
  key: string,
): PlaceSearchCursor {
  if (!value) return { key, rowid: 0 }
  try {
    const cursor = cursorSchema.parse(JSON.parse(decodeURIComponent(value)))
    if (cursor.key === key) return cursor
  } catch {
    /* Invalid cursors use the same explicit restart contract. */
  }
  throw new PlaceSearchExpiredError(
    'Place search changed. Search again to refresh the results.',
  )
}
/** Encode a validated page position without exposing SQL or accepting source URLs.
 * @param cursor Validated scan position.
 * @returns Opaque continuation for the next request.
 */
export function writePlaceSearchCursor(cursor: PlaceSearchCursor): string {
  return encodeURIComponent(JSON.stringify(cursor))
}
