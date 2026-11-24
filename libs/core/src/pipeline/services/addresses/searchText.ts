/** Query-only normalisation: canonical names and publisher evidence stay untouched.
 * @param value Address comparison text.
 * @returns A normalised comparison key, never an authored label.
 */
export function normaliseAddressText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[一二三四五六七八九](?=期)/g, digit =>
      String('一二三四五六七八九'.indexOf(digit) + 1),
    )
    .replace(/[’'`]/g, '')
    .replace(
      /\b(rd|st|ave|ln|sq|hwy|bldg|hse)\.?\b/g,
      word =>
        ({
          rd: 'road',
          st: 'street',
          ave: 'avenue',
          ln: 'lane',
          sq: 'square',
          hwy: 'highway',
          bldg: 'building',
          hse: 'house',
        })[word.replace('.', '')]!,
    )
    .replace(
      /\b(road|street)\s+([ewns])\b/g,
      (_, road, direction) =>
        `${road} ${{ e: 'east', w: 'west', n: 'north', s: 'south' }[direction as string]}`,
    )
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export const ADDRESS_GRAM_FORMAT = 'address-grams-v1'
/** Encode literal Unicode grams as safe single FTS terms. */
const gram = (value: string): string =>
  'g' +
  [...value].map(char => char.codePointAt(0)!.toString(16).padStart(6, '0')).join('')
/** Build compact postings for one-, two- and three-character partial matches.
 * @param value Published localisation fields joined for retrieval.
 * @returns Unique encoded FTS terms.
 */
export function addressSearchGrams(value: string): string {
  const terms = new Set<string>()
  for (const word of normaliseAddressText(value).split(' ')) {
    const chars = [...word]
    for (const size of [1, 2, 3])
      for (let index = 0; index + size <= chars.length; index++)
        terms.add(gram(chars.slice(index, index + size).join('')))
  }
  return [...terms].join(' ')
}
/** Narrow literal substrings while retaining complete embedded building names.
 * @param input Literal query text.
 * @returns A conservative FTS candidate expression, or null for empty text.
 */
export function addressGramQuery(input: string): string | null {
  const words = normaliseAddressText(input).split(' ').filter(Boolean)
  if (!words.length) return null
  const queryTerms = (word: string): string[] => {
    const chars = [...word],
      size = Math.min(3, chars.length)
    return [
      ...new Set(
        Array.from({ length: chars.length - size + 1 }, (_, index) =>
          gram(chars.slice(index, index + size).join('')),
        ),
      ),
    ]
  }
  const anchor = [...words].sort((a, b) => b.length - a.length)[0]!
  const literals = queryTerms(anchor)
    .map(term => `"${term}"`)
    .join(' AND ')
  const embedded = [...new Set(words.flatMap(queryTerms))]
    .map(term => `"${term}"`)
    .join(' OR ')
  return `(text : (${literals})) OR (building : (${embedded}))`
}
/** Bind index readiness to physical scopes and their exact publication tokens.
 * @param publications Ready physical publications.
 * @returns One format-bound readiness term per publication.
 */
export async function addressGramReadiness(
  publications: readonly {
    scopeId: string
    snapshotId: string
    publicationToken: string
  }[],
): Promise<string[]> {
  return Promise.all(
    publications.map(async row => {
      const bytes = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify([
            ADDRESS_GRAM_FORMAT,
            row.scopeId,
            row.snapshotId,
            row.publicationToken,
          ]),
        ),
      )
      return (
        'r' +
        Array.from(new Uint8Array(bytes), byte =>
          byte.toString(16).padStart(2, '0'),
        ).join('')
      )
    }),
  )
}
/** Create a contentless derived index; the caller owns activation and publication guards.
 * @param table Internal trusted index identifier.
 * @returns Virtual-table DDL.
 */
export const createAddressGramIndexSql = (table = 'addressGeocodingFts'): string =>
  `CREATE VIRTUAL TABLE ${table} USING fts5(text, building, content='', detail=column, columnsize=0)`
