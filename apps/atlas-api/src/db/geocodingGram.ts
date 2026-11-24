import { currentSchema, sql, type CurrentDatabase, type SQL } from '@repo/db'
import {
  addressGramQuery,
  addressGramReadiness,
} from '@repo/core/pipeline/services/addresses/searchText'
import { PublicationReadUnavailableError } from './publicationState'
/** Retrieve candidate rowids from normalized gram postings without scanning publisher text.
 * @param db Current serving database.
 * @param snapshotIds Publication-pinned address snapshots.
 * @param input Literal address/name query.
 * @param required Lazy search must fail closed when the prepared index is unavailable.
 * @returns An indexed rowid predicate, or null for legacy unprepared callers.
 */
export async function geocodingGramSelection(
  db: CurrentDatabase,
  snapshotIds: readonly string[],
  input: string,
  required = false,
): Promise<SQL | null> {
  const match = addressGramQuery(input)
  if (!match) return sql`0=1`
  try {
    const publications = await db.all<{
      scopeId: string
      snapshotId: string
      publicationToken: string
    }>(
      sql`SELECT scopeId,snapshotId,publicationToken FROM addressPublicationState WHERE status='current' AND preparedAt IS NOT NULL AND publicationToken<>'' AND snapshotId IN (SELECT value FROM json_each(${JSON.stringify(snapshotIds)}))`,
    )
    if (publications.length !== new Set(snapshotIds).size)
      throw new PublicationReadUnavailableError('Address publication unavailable.')
    const ready = (await addressGramReadiness(publications))
      .map(term => `"${term}"`)
      .join(' AND ')
    const rows = await db.all(
      sql`SELECT rowid FROM addressGeocodingFts WHERE addressGeocodingFts MATCH ${ready} AND rowid=-1`,
    )
    if (!rows.length)
      throw new PublicationReadUnavailableError(
        'Address substring index requires finalisation.',
      )
    const names = currentSchema.address2dI18n
    return sql`${names}.rowid IN (SELECT rowid FROM addressGeocodingFts WHERE addressGeocodingFts MATCH ${match} AND rowid>0)`
  } catch (error) {
    if (
      !(error instanceof PublicationReadUnavailableError) &&
      !/no such table/.test(
        String(error) + ' ' + String((error as { cause?: unknown })?.cause),
      )
    )
      throw error
    if (required)
      throw new PublicationReadUnavailableError(
        'Address substring index requires finalisation.',
      )
    return null
  }
}
