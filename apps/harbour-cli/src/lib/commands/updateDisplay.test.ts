import { expect, test } from 'bun:test'
import { OperationProgress } from '../cli/operationProgress.ts'
import { UpdateRow } from './updateDisplay.ts'
import { formatUpdateGridRow } from './updateFormatting.ts'

test('aligns mixed datasets and statuses in fixed columns within 120 characters', () => {
  const rows = ['street', 'divisionStatistic', 'address'].map(type =>
    formatUpdateGridRow(
      {
        code: `ds-hk-hkgov-censtatd-${type}-a-very-long-dataset-name-that-needs-clipping`,
        publisherCode: 'hkgov-censtatd',
        regionCode: 'hk',
        theme: 'stats',
        resourceTypes: [type],
        versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
      },
      'SKIPPED: no updates',
      '2026-06-17.0',
    ),
  )
  expect(new Set(rows.map(row => row.indexOf('SKIPPED:'))).size).toBe(1)
  expect(new Set(rows.map(row => row.indexOf('v2026-06-17.0'))).size).toBe(1)
  for (const row of rows) {
    expect(row).not.toContain('\n')
    expect(row.length).toBeLessThanOrEqual(120)
  }
})

test('renders a completed update row without requiring a previous live phase', () => {
  const messages: string[] = []
  const progress = new OperationProgress({
    compact: true,
    renderAnimated: false,
    ui: {
      spinner() {
        throw new Error('Static output must not animate')
      },
      progress() {
        throw new Error('Static output must not animate')
      },
      log: {
        step() {},
        error() {},
        success(message) {
          messages.push(message ?? '')
        },
      },
    },
  })
  const row = new UpdateRow(
    {
      code: 'ds-hk-overture-place',
      publisherCode: 'overture',
      regionCode: 'hk',
      theme: 'places',
      resourceTypes: ['place'],
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
    },
    progress,
  )
  row.finish('UPLOADED', '2026-08-19.0', '2026-08-19.0')
  expect(messages).toHaveLength(1)
  expect(messages[0]).toContain('UPLOADED')
  expect(progress.hasActivePhase()).toBe(false)
  messages.length = 0
  row.skipped('target release report unavailable')
  expect(messages).toHaveLength(1)
  expect(messages[0]).toContain('SKIPPED:')
  expect(messages[0]).not.toContain('\n')
  expect(messages[0]?.length).toBeLessThanOrEqual(120)
})
