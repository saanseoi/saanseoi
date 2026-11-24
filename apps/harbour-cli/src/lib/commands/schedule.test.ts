import { expect, test } from 'bun:test'

import {
  buildUnits,
  scheduledJobArguments,
  scheduledJobResult,
  scheduledNotificationArguments,
} from './schedule.ts'

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

test('scheduled results distinguish missing evidence, errors and successful publication', () => {
  expect(scheduledJobResult('update', '1s', 0).state).toBe('Unverified')
  expect(scheduledJobResult('update', '1s', 1).state).toBe('Failed')
  expect(scheduledJobResult('tiles', '1s', 1).body).not.toContain('✅')
  expect(
    scheduledJobResult('update', '1s', 0, { added: [], errors: ['Upload failed'] }),
  ).toMatchObject({ state: 'Failed', body: expect.stringContaining('Upload failed') })
  expect(scheduledJobResult('update', '1s', 0, { added: [], errors: [] }).state).toBe(
    'Complete',
  )
  expect(
    scheduledJobResult('update', '1s', 0, {
      added: [{ datasetCode: 'example', version: 'v1' }],
      errors: [],
    }).body,
  ).toContain('example · v1')
})

test('notjik cards update per job and expose argument-safe follow-up actions', () => {
  const args = scheduledNotificationArguments(
    'update',
    'Failed',
    'Error',
    '2s',
    '/tmp/a log;file',
  )
  expect(args[args.indexOf('--id') + 1]).toBe('schedule-update')
  expect(args[args.indexOf('--timeout') + 1]).toBe('until-dismissed')
  expect(JSON.parse(args[args.indexOf('--data') + 1]).tone).toBe('critical')
  const actions = JSON.parse(args[args.indexOf('--actions') + 1])
  expect(actions[0].command).toEqual([
    'kitty',
    '--hold',
    'less',
    '--',
    '/tmp/a log;file',
  ])
  expect(actions[1].command).toContain('saanseoi-daily-update.service')
  const tiles = scheduledNotificationArguments('tiles', 'Running', 'Running', '0s')
  expect(tiles[tiles.indexOf('--id') + 1]).toBe('schedule-tiles')
  expect(JSON.parse(tiles[tiles.indexOf('--actions') + 1])).toHaveLength(1)
})

test('both jobs send structured results instead of embedding them in the description', () => {
  const update = scheduledJobResult('update', '2m', 0, {
    added: [
      {
        datasetCode: 'ds-example',
        datasetName: 'Example addresses',
        version: '2026-10',
      },
    ],
    errors: [],
  })
  expect(update.results).toEqual([
    {
      label: 'Source releases',
      value: '1 published',
      ingredients: [{ label: 'Example addresses', value: '2026-10' }],
    },
  ])
  const rows = [
    {
      label: 'Hong Kong tiles',
      value: 'Refreshed',
      ingredients: [{ label: 'Release', value: '2026-10-01' }],
    },
  ]
  const tiles = scheduledJobResult('tiles', '8m', 0, {
    added: [],
    errors: [],
    results: rows,
  })
  expect(tiles.state).toBe('Complete')
  expect(tiles.results).toEqual(rows)
  for (const [job, result] of [
    ['update', update],
    ['tiles', tiles],
  ] as const) {
    const args = scheduledNotificationArguments(
      job,
      result.state,
      '',
      '2m',
      undefined,
      result.results,
    )
    expect(args[2]).toBe('')
    expect(args[args.indexOf('--type') + 1]).toBe('results-table')
    expect(JSON.parse(args[args.indexOf('--data') + 1])).toMatchObject({
      duration: '2m',
      results: result.results,
    })
  }
})

test('tile completion requires a result summary and failures remain structured', () => {
  expect(scheduledJobResult('tiles', '1s', 0).state).toBe('Unverified')
  expect(scheduledJobResult('tiles', '1s', 0, { added: [], errors: [] }).state).toBe(
    'Unverified',
  )
  const failed = scheduledJobResult('update', '1s', 1, {
    added: [],
    errors: ['Upload rejected'],
  })
  expect(failed.results).toContainEqual({
    label: 'Issues',
    value: '1',
    tone: 'critical',
    ingredients: [{ label: 'Upload rejected', value: 'Failed' }],
  })
  expect(failed.results).toContainEqual({
    label: 'Command',
    value: 'Exit 1',
    tone: 'critical',
    ingredients: [],
  })
})
