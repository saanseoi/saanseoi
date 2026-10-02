import { expect, test } from 'bun:test'

import { buildUnits, scheduledJobArguments } from './schedule.ts'

test('monthly catch-up retains the first-of-month release date', () => {
  expect(scheduledJobArguments('tiles', '2026-10-02')).toEqual([
    'tiles:refresh',
    '--date',
    '2026-10-01',
  ])
  expect(scheduledJobArguments('update', '2026-10-02')).toEqual(['update', '--yes'])
})

test('creates persistent user timers for the nightly update and monthly tiles', () => {
  const units = buildUnits(
    '/home/example/code/saanseoi/bin/saanseoi',
    '/home/example/.bun/bin/bun',
  )

  expect(units['saanseoi-monthly-tiles.timer']).toContain('OnCalendar=*-*-01 00:05:00')
  expect(units['saanseoi-daily-update.timer']).toContain('OnCalendar=*-*-* 00:30:00')
  expect(units['saanseoi-monthly-tiles.timer']).toContain('Persistent=true')
  expect(units['saanseoi-daily-update.service']).toContain(
    'After=network-online.target saanseoi-monthly-tiles.service',
  )
  expect(units['saanseoi-daily-update.service']).toContain(
    'ExecStart="/home/example/code/saanseoi/bin/saanseoi" schedule:run update',
  )
  expect(units['saanseoi-monthly-tiles.service']).toContain(
    'Environment=SAANSEOI_BUN_PATH="/home/example/.bun/bin/bun"',
  )
  expect(units['saanseoi-monthly-tiles.service']).toContain(
    'EnvironmentFile=-%h/.config/saanseoi/scheduled-jobs.env',
  )
  expect(units['saanseoi-daily-update.service']).toContain(
    'EnvironmentFile=-%h/.config/saanseoi/scheduled-jobs.env',
  )
})
