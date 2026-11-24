import {
  addressSearchGrams,
  addressGramReadiness,
  createAddressGramIndexSql,
} from './searchText'
import type { SearchD1Database } from '../search/incrementalIndex'

type SourceRow = {
  rowid: number
  formattedAddress: string | null
  buildingName: string | null
  premisesName: string | null
  streetName: string | null
}
type Publication = { scopeId: string; snapshotId: string; publicationToken: string }
/** Build a contentless Unicode gram index, promoting it only under unchanged publication guards.
 * @param current Serving D1 binding; no source or canonical records are modified.
 * @returns Number of indexed localized address rows.
 * @remarks A failed build leaves the previous index active. Publication tokens invalidate it on data changes.
 */
export async function synchroniseAddressSubstringSearch(
  current: SearchD1Database,
): Promise<number> {
  const publications = (
    await current
      .prepare(
        "SELECT scopeId,snapshotId,publicationToken FROM addressPublicationState WHERE status='current' AND preparedAt IS NOT NULL AND publicationToken<>'' ORDER BY scopeId",
      )
      .all<Publication>()
  ).results
  if (!publications.length) return 0
  const ready = await addressGramReadiness(publications)
  try {
    const match = ready.map(term => `"${term}"`).join(' AND ')
    if (
      (
        await current
          .prepare(
            'SELECT rowid FROM addressGeocodingFts WHERE addressGeocodingFts MATCH ? AND rowid=-1',
          )
          .bind(match)
          .all()
      ).results.length
    )
      return 0
  } catch (error) {
    if (!/no such table/.test(String(error))) throw error
  }
  const stage = `addressGeocodingStage_${crypto.randomUUID().replaceAll('-', '')}`
  await current.prepare(createAddressGramIndexSql(stage)).run()
  let after = 0,
    count = 0
  try {
    for (;;) {
      const rows = (
        await current
          .prepare(
            `SELECT rowid,formattedAddress,buildingName,premisesName,streetName FROM address2dI18n WHERE rowid>? AND scopeId IN (SELECT json_extract(value,'$.scopeId') FROM json_each(?)) ORDER BY rowid LIMIT 128`,
          )
          .bind(after, JSON.stringify(publications))
          .all<SourceRow>()
      ).results
      if (!rows.length) break
      const values = rows.map(row => ({
        rowid: row.rowid,
        text: addressSearchGrams(
          [row.formattedAddress, row.buildingName, row.premisesName, row.streetName]
            .filter(Boolean)
            .join(' '),
        ),
        building: addressSearchGrams(row.buildingName ?? ''),
      }))
      // JSON binds keep statement parameter counts constant and batches below D1 row-size limits.
      const writes: D1PreparedStatement[] = []
      for (let offset = 0; offset < values.length; offset += 16)
        writes.push(
          current
            .prepare(
              `INSERT INTO ${stage}(rowid,text,building) SELECT json_extract(value,'$.rowid'),json_extract(value,'$.text'),json_extract(value,'$.building') FROM json_each(?)`,
            )
            .bind(JSON.stringify(values.slice(offset, offset + 16))),
        )
      await current.batch(writes)
      after = rows.at(-1)!.rowid
      count += rows.length
    }
    await current
      .prepare(`INSERT INTO ${stage}(${stage}) VALUES('integrity-check')`)
      .run()
    const guard = `SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(?) wanted WHERE NOT EXISTS(SELECT 1 FROM addressPublicationState p WHERE p.scopeId=json_extract(wanted.value,'$.scopeId') AND p.snapshotId=json_extract(wanted.value,'$.snapshotId') AND p.publicationToken=json_extract(wanted.value,'$.publicationToken') AND p.status='current' AND p.preparedAt IS NOT NULL)) THEN 1 ELSE abs(-9223372036854775808) END`
    await current.batch([
      current.prepare(guard).bind(JSON.stringify(publications)),
      current
        .prepare(`INSERT INTO ${stage}(rowid,text,building) VALUES(-1,?,'')`)
        .bind(ready.join(' ')),
      current.prepare('DROP TABLE IF EXISTS addressGeocodingFts'),
      current.prepare(`ALTER TABLE ${stage} RENAME TO addressGeocodingFts`),
    ])
    return count
  } catch (error) {
    await current.prepare(`DROP TABLE IF EXISTS ${stage}`).run()
    throw error
  }
}
