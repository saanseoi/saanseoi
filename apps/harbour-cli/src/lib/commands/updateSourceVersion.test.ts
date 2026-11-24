import { expect, test } from 'bun:test'
import { selectUpdateSourceVersion } from './updateSourceVersion'

test('pins all October resource types and excludes newer and older releases', () => {
  const october = ['division', 'divisionArea', 'divisionBoundary'].map(type => ({
    type,
    version: '2026-10-21.0',
    status: 'available',
  }))
  expect(
    selectUpdateSourceVersion(
      [
        { type: 'division', version: '2026-11-18.0', status: 'available' },
        ...october,
        { type: 'division', version: '2026-09-23.0', status: 'current' },
      ],
      '2026-10-21.0',
    ),
  ).toEqual(october)
})

test('fails closed when the requested release is absent and retains discovery errors', () => {
  expect(() => selectUpdateSourceVersion([], '2026-10-21.0')).toThrow('not discovered')
  const errors = [{ status: 'error' }]
  expect(selectUpdateSourceVersion(errors, '2026-10-21.0')).toEqual(errors)
  expect(selectUpdateSourceVersion(errors, undefined)).toBe(errors)
})
