import { expect, test } from 'bun:test'
import { reviewDivisionUpdates, publisherSimplifiedNames } from './updateReview'
import type { ReviewDivision } from '@repo/core/pipeline/services/divisions/geographicReview'
const row = (id: string, en = 'Village'): ReviewDivision => ({
  id,
  names: { en, 'zh-hant': '村' },
  class: 'village',
  category: 'locality',
  level: 5,
  point: [114, 22],
  hierarchies: { full: [] },
})
const policy = {
  coreLocales: ['en', 'zh-hant'],
  excludedNewNamePatterns: ['\\bplaza\\b', '廣場'],
}
test('new divisions are included except coverage exclusions', () => {
  const result = reviewDivisionUpdates(
    [],
    [row('village'), row('plaza', 'Roman Plaza')],
    policy,
    [],
  )
  expect(result.divisions.map(row => row.id)).toEqual(['village'])
  expect(result.events.map(row => row.status)).toEqual(['added', 'excluded'])
})
test('each removal needs an exact keep/delete decision; stale approvals do not apply', () => {
  const original = row('old')
  const proposal = reviewDivisionUpdates([original], [], policy, [])
  expect(proposal.pending).toHaveLength(1)
  const fingerprint = proposal.pending[0]!.fingerprint
  expect(
    reviewDivisionUpdates([original], [], policy, [
      { fingerprint, action: 'keep', reason: 'Still exists' },
    ]).divisions,
  ).toEqual([original])
  expect(
    reviewDivisionUpdates([original], [], policy, [
      { fingerprint, action: 'delete', reason: 'Confirmed removed' },
    ]).pending,
  ).toHaveLength(0)
  expect(
    reviewDivisionUpdates([row('old', 'Changed baseline')], [], policy, [
      { fingerprint, action: 'delete', reason: 'Old approval' },
    ]).pending,
  ).toHaveLength(1)
})
test('lost names are restored and replacements require review without mutating inputs', () => {
  const accepted = row('a')
  const changed = row('a', 'New Village')
  delete changed.names['zh-hant']
  const review = reviewDivisionUpdates([accepted], [changed], policy, [])
  expect(review.divisions[0]!.names).toEqual(accepted.names)
  expect(changed.names.en).toBe('New Village')
  const fingerprint = review.pending[0]!.fingerprint
  const approved = reviewDivisionUpdates([accepted], [changed], policy, [
    { fingerprint, action: 'accept', reason: 'Verified name' },
  ])
  expect(approved.pending).toHaveLength(0)
  expect(approved.divisions[0]!.names).toEqual({ en: 'New Village', 'zh-hant': '村' })
})

test('Simplified Chinese requires explicit Overture evidence and never comes from Traditional Chinese', () => {
  const names = publisherSimplifiedNames([
    { id: 'provided', names: { common: { 'zh-Hans': '原名', 'zh-CN': '地区名' } } },
    { id: 'traditional', names: { common: { zh: '香港', 'zh-Hant': '香港' } } },
    { id: 'array', names: { common: [{ language: 'zh-Hans', value: '村' }] } },
    { id: 'pairs', names: { common: [['zh-SG', '岛']] } },
  ])
  expect([...names]).toEqual([
    ['provided', '原名'],
    ['array', '村'],
    ['pairs', '岛'],
  ])
})
