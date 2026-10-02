import { expect, test } from 'bun:test'
import { resolveTilesInput } from './tilesOptions.ts'
import { today } from './tilesExecution.ts'

test('refresh accepts a fixed release date for recovery', () => {
  expect(
    resolveTilesInput(
      { command: 'tiles:refresh', positionals: [], options: { date: '2026-10-01' } },
      () => {},
      'refresh',
    ).version,
  ).toBe('2026-10-01')
  expect(
    resolveTilesInput(
      { command: 'tiles:refresh', positionals: [], options: {} },
      () => {},
      'refresh',
    ).version,
  ).toBe(today())
})

test('refresh rejects missing, invalid and future release dates', () => {
  for (const date of [true, '2026-02-30', '2026-13-01', '2026.10.01', '2099-01-01']) {
    expect(() =>
      resolveTilesInput(
        { command: 'tiles:refresh', positionals: [], options: { date } },
        () => {},
        'refresh',
      ),
    ).toThrow()
  }
})
