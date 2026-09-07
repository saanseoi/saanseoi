import { expect, test } from 'bun:test'
import { resolveHkgovAlsCurationVerification } from './hkgovAlsCurationLifecycle'

const active = {
  lastVerifiedSourceVersion: '2026-08-19.0',
  mode: 'until-revoked' as const,
  sourceVersionFrom: '2026-08-19.0',
  state: 'active' as const,
}

test('retains listed historic repairs and flags later active applications', () => {
  expect(
    resolveHkgovAlsCurationVerification('2026-04-03.0', ['2026-04-03.0'], active),
  ).toBe('verified')
  expect(resolveHkgovAlsCurationVerification('2026-08-19.0', [], active)).toBeNull()
  expect(resolveHkgovAlsCurationVerification('2026-09-01.0', [], active)).toBe(
    'unverified',
  )
})

test('does not apply a revoked curation beyond its listed releases', () => {
  expect(
    resolveHkgovAlsCurationVerification('2026-09-01.0', [], {
      ...active,
      state: 'revoked',
    }),
  ).toBeNull()
})
