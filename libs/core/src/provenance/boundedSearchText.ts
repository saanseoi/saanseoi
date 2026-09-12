import { MAX_OBJECT_BYTES, serialise } from './objects'

/** Byte-identical to testing the whole envelope after every token, without quadratic work. */
export function boundedBulkSearchText(
  tokens: readonly string[],
  limit = MAX_OBJECT_BYTES,
) {
  const encoder = new TextEncoder()
  let bytes = encoder.encode(
    serialise({ kind: 'bulk-search', schemaVersion: 1, text: '' }),
  ).length
  const retained: string[] = []
  for (const token of tokens) {
    // Quotes belong to the envelope; include JSON escaping and UTF-8 bytes of each token.
    const additional =
      encoder.encode(JSON.stringify(token)).length - 2 + (retained.length ? 1 : 0)
    if (bytes + additional > limit) break
    bytes += additional
    retained.push(token)
  }
  return retained.join(' ')
}
