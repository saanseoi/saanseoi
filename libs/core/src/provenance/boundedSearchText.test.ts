import { expect, test } from 'bun:test'
import { boundedBulkSearchText } from './boundedSearchText'
import { serialise } from './objects'

function original(tokens: string[], limit: number) {
  let bounded = ''
  for (const token of tokens) {
    const next = bounded ? `${bounded} ${token}` : token
    if (
      new TextEncoder().encode(
        serialise({ kind: 'bulk-search', schemaVersion: 1, text: next }),
      ).length > limit
    )
      break
    bounded = next
  }
  return bounded
}

test('incremental search bound preserves exact JSON byte boundaries and token order', () => {
  const tokens = [
    'a',
    '香港',
    'quote"',
    'slash\\',
    'line\n',
    '\uD800',
    '😀',
    'z'.repeat(100),
  ]
  for (let limit = 1; limit < 350; limit++)
    expect(boundedBulkSearchText(tokens, limit)).toBe(original(tokens, limit))
  expect(boundedBulkSearchText([])).toBe('')
})

test('large token lists preserve the original bounded prefix', () => {
  const tokens = Array.from({ length: 5000 }, (_, i) => `token-${i}`)
  expect(boundedBulkSearchText(tokens, 12000)).toBe(original(tokens, 12000))
})
