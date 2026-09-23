import { MAX_OBJECT_BYTES, serialise } from './objects'

/** Byte-identical to testing the whole envelope after every token, without quadratic work. */
export function boundedBulkSearchText(
  tokens: readonly string[],
  limit = MAX_OBJECT_BYTES,
) {
  const builder = createBoundedBulkSearchText(limit)
  for (const token of tokens) if (!builder.add(token)) break
  return builder.text()
}

export function createBoundedBulkSearchText(limit = MAX_OBJECT_BYTES) {
  const encoder = new TextEncoder()
  let bytes = encoder.encode(
    serialise({ kind: 'bulk-search', schemaVersion: 1, text: '' }),
  ).length
  const retained: string[] = []
  return {
    add(token: string) {
      // Quotes belong to the envelope; include JSON escaping and UTF-8 bytes of each token.
      const additional =
        encoder.encode(JSON.stringify(token)).length - 2 + (retained.length ? 1 : 0)
      if (bytes + additional > limit) return false
      bytes += additional
      retained.push(token)
      return true
    },
    text: () => retained.join(' '),
  }
}
