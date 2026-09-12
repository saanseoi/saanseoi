import { expect, test } from 'bun:test'
import { isUnpublishedMacao } from './region'

test('Macao empty-region handling preserves pending publication errors', () => {
  const response = { status: 503, body: { error: 'snapshot_not_ready' } }
  expect(isUnpublishedMacao('mo', response)).toBe(true)
  expect(isUnpublishedMacao('mo', { ...response, publicationPending: true })).toBe(
    false,
  )
})
