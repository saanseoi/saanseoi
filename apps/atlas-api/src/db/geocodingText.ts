import { geocodingGramSelection } from './geocodingGram'
import { currentSchema, sql, type CurrentDatabase, type SQL } from '@repo/db'
import type { GeocodingQuery } from '../schema/geocoding'
import { normaliseAddressText } from '../services/addressParsing'

const aliases = [
  ['road', 'rd'],
  ['street', 'st'],
  ['avenue', 'ave'],
  ['lane', 'ln'],
  ['square', 'sq'],
  ['highway', 'hwy'],
  ['building', 'bldg'],
  ['house', 'hse'],
  ['east', 'e'],
  ['west', 'w'],
  ['north', 'n'],
  ['south', 's'],
]

/** Build literal prefix terms; FTS syntax is never taken from user input.
 * @param input Address or place-name text.
 * @returns An FTS expression for complete text or an embedded building name.
 */
export function geocodingFtsQuery(input: string): string | null {
  const tokens = normaliseAddressText(input).match(/[\p{L}\p{N}]+/gu) ?? []
  if (!tokens.length) return null
  const terms = tokens.map(token => {
    const variants = new Set(aliases.find(group => group.includes(token)) ?? [token])
    // Apostrophes split FTS tokens: Queen's is indexed as queen + s.
    if (token.length > 2 && token.endsWith('s')) variants.add(token.slice(0, -1))
    for (const variant of [...variants]) {
      // unicode61 does not perform NFKC on publisher-authored fullwidth Latin text.
      if (/^[a-z0-9]+$/.test(variant))
        variants.add(
          variant.replace(/[a-z0-9]/g, c =>
            String.fromCharCode(c.charCodeAt(0) + 0xfee0),
          ),
        )
    }
    return `(${[...variants].map(value => `"${value}"*`).join(' OR ')})`
  })
  // Extra listing text must not hide a complete building name. The exact scorer
  // rejects unrelated token hits and retains the distinguishing name and number.
  return `(${terms.join(' AND ')}) OR (buildingName : (${terms.join(' OR ')}))`
}

export type GeocodingTextSelection = { condition: SQL; byRowId: boolean }

/** Narrow text candidates without treating an FTS hit as an accepted result.
 * @param db Current serving database.
 * @param snapshotIds Pinned logical address publications.
 * @param query Forward text query.
 * @returns A candidate predicate, or undefined for the exhaustive unindexed path.
 * @remarks Scope joins prevent another release's index from supplying candidates.
 */
export async function geocodingTextSelection(
  db: CurrentDatabase,
  snapshotIds: string[],
  query: GeocodingQuery,
): Promise<GeocodingTextSelection | undefined> {
  const indexed = await geocodingGramSelection(
    db,
    snapshotIds,
    (query.address ?? query.placename)!,
  )
  if (indexed) return { condition: indexed, byRowId: true }
  const {
    addressSearchScopes: scopes,
    addressPublicationState: publications,
    addressesFts: fts,
    address2dI18n: names,
  } = currentSchema
  const ready = await db.select({ snapshotId: scopes.snapshotId }).from(scopes).all()
  if (snapshotIds.some(id => !ready.some(row => row.snapshotId === id)))
    return undefined
  const input = (query.address ?? query.placename)!
  const normalised = normaliseAddressText(input)
  const match = geocodingFtsQuery(input)
  if (!match) return { condition: sql`0 = 1`, byRowId: false }
  // Literal substrings complement word-token FTS, particularly for Chinese and
  // Latin infixes. Apostrophe removal follows the final scorer's normalisation.
  const text = (column: SQL) =>
    sql`lower(replace(replace(replace(coalesce(${column}, ''), '''', ''), '’', ''), char(96), ''))`
  const tokens = normalised.match(/[\p{L}\p{N}]+/gu) ?? []
  const anchor = [...tokens].sort((a, b) => b.length - a.length)[0]!
  // The longest literal token also catches infixes and non-canonical whitespace.
  // Include abbreviations whose expansion could have introduced that substring.
  const anchors = [
    ...new Set([anchor, ...aliases.filter(group => group[0]!.includes(anchor)).flat()]),
  ]
  const raw = sql`coalesce(${names.formattedAddress}, '') || ' ' || coalesce(${names.buildingName}, '') || ' ' || coalesce(${names.premisesName}, '') || ' ' || coalesce(${names.streetName}, '')`
  const searchable = text(raw)
  const building = text(sql`${names.buildingName}`)
  const literalMatch =
    anchors.length === 1
      ? sql`instr(${searchable}, ${anchor}) > 0`
      : sql`exists (select 1 from json_each(${JSON.stringify(anchors)}) where instr(${searchable}, value) > 0)`

  // Preserve the exact scorer for Unicode compatibility/case folding and Chinese
  // phase numerals that SQLite cannot normalise. Ordinary Han text stays on the
  // cheap substring path; exceptional rows are scored, never blindly accepted.
  return {
    byRowId: false,
    condition: sql`(
    (${names.scopeId}, ${names.addressId}) in (
      select ${publications.scopeId}, ${fts.addressId} from ${fts}
      join ${scopes} on ${scopes.scopeId} = ${fts.scopeId}
      join ${publications} on ${publications.snapshotId} = ${scopes.snapshotId} and ${publications.status} = 'current'
      where ${fts} match ${match}
      and ${scopes.snapshotId} in (select value from json_each(${JSON.stringify(snapshotIds)}))
    )
    or ${literalMatch}
    or (length(${building}) >= 4 and instr(${normalised}, ${building}) > 0)
    or (${raw}) glob '*[^ -~㐀-䶿一-鿿]*'
    or (${raw}) glob '*[一二三四五六七八九]期*'
  )`,
  }
}
