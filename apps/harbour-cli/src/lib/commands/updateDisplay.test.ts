import { expect, test } from 'bun:test'
import { OperationProgress } from '../cli/operationProgress.ts'
import { UpdateRow } from './updateDisplay.ts'
import { formatUpdateErrorSummary, formatUpdateGridRow } from './updateFormatting.ts'
import { loadDatasetFixtures } from '../sources/sourceUpdates.ts'

test('groups final errors under aligned dataset rows and preserves recovery instructions', async () => {
  const datasets = await loadDatasetFixtures()
  const command =
    'bun run dataops -- hkgov-dpo:ingest data/hkgov/dpo/ALS --target local'
  const summary = formatUpdateErrorSummary(
    [
      'ds-hk-hkgov-hyd-sensitive-street: HyD street ingest failed.',
      `ds-hk-hkgov-dpo-address: ALS intake stopped.\nRun interactively with:\n${command}`,
      'Unexpected update failure',
    ],
    datasets,
  )
  expect(summary).toContain('Update errors (3)\n\n')
  expect(summary).toContain('HyD')
  expect(summary).toContain('Sensitive')
  expect(summary).not.toContain('ds-hk-hkgov-hyd-sensitive-street:')
  expect(summary).toContain('\n    HyD street ingest failed.\n\n')
  expect(summary).toContain(`\n    Run interactively with:\n    ${command}`)
  expect(summary).toContain('\n\n    Unexpected update failure')
  const rows = summary.split('\n').filter(line => line.includes('ERROR'))
  expect(rows).toHaveLength(2)
  expect(rows[0]?.indexOf('ERROR')).toBe(rows[1]?.indexOf('ERROR'))
})

test('preserves colour and terminal width when the logger pipes stdout', () => {
  const script = `
    import { formatUpdateGridRow } from ${JSON.stringify(`${import.meta.dir}/updateFormatting.ts`)};
    console.log(formatUpdateGridRow({code: 'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups', publisherCode: 'hkgov-censtatd', regionCode: 'hk', resourceTypes: ['divisionStatistic']}, 'ERROR', '2026-Q2'));
  `
  const run = (noColour: boolean) =>
    Bun.spawnSync([process.execPath, '-e', script], {
      env: {
        ...process.env,
        SAANSEOI_TERMINAL_INTERACTIVE: '1',
        SAANSEOI_TERMINAL_COLUMNS: '173',
        FORCE_COLOR: '1',
        ...(noColour ? { NO_COLOR: '1' } : { NO_COLOR: undefined }),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
  const coloured = run(false)
  expect(coloured.exitCode).toBe(0)
  const output = coloured.stdout.toString()
  expect(output).toContain('\u001b[31mERROR')
  expect(output).toContain('Housing Market Areas Building Groups')
  const plain = run(true).stdout.toString()
  expect(plain).not.toContain('\u001b[')
  expect(Bun.stripANSI(output)).toBe(plain)
})

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
