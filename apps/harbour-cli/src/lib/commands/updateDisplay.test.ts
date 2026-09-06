import { expect, test } from 'bun:test'
import { OperationProgress } from '../cli/operationProgress.ts'
import { UpdateRow } from './updateDisplay.ts'

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
})
