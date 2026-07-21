import { describe, expect, mock, test } from 'bun:test'

describe('local import progress orchestration', () => {
  test('labels address SQL pre-import bookkeeping before import starts', async () => {
    const events: Array<{ label: string; type: string }> = []

    mock.module('@clack/prompts', () => ({
      progress() {
        return {
          advance(_value: number, label?: string) {
            if (label) {
              events.push({ label: stripAnsi(label), type: 'advance' })
            }
          },
          clear() {},
          message(label: string) {
            events.push({ label: stripAnsi(label), type: 'message' })
          },
          start(label: string) {
            events.push({ label: stripAnsi(label), type: 'start' })
          },
          stop(label: string) {
            events.push({ label: stripAnsi(label), type: 'stop' })
          },
        }
      },
    }))

    const { LocalUploadProgress } = await import('../localUploadProgress.ts')
    const { createLocalImportProgressClient } = await import('./orchestrator.ts')
    const controlEvents: string[] = []
    const harbourClient = {
      async publishDataset() {},
      async stageCompleted(_releaseId: string, phase: string) {
        controlEvents.push(`completed:${phase}`)
      },
      async stageFailed() {},
      async stageRunning(_releaseId: string, phase: string) {
        controlEvents.push(`running:${phase}`)
      },
    }
    const progress = new LocalUploadProgress()
    const client = createLocalImportProgressClient(harbourClient, progress, {
      cleanup: {
        completedLabel: 'Cleanup staging',
        phase: 'cleanupAddressSqlStaging',
        runningLabel: current => `Cleanup staging (${current}/1)`,
        totalUnits: 1,
      },
      importPhases: [
        {
          completedLabel: 'Import SQL',
          phase: 'importAddressSqlSource',
          runningLabel: current => `Import SQL (${current}/1)`,
          totalUnits: 1,
        },
      ],
      publish: {
        completedLabel: 'Publish release',
        phase: 'publishDataset',
        runningLabel: current => `Publish release (${current}/1)`,
        totalUnits: 1,
      },
    })

    await client.stageRunning('release-id', 'processDataset')
    await client.stageCompleted('release-id', 'normaliseAddressSql')
    await client.stageCompleted('release-id', 'generateAddressSqlCurrent')
    await client.stageRunning('release-id', 'importAddressSqlSource')

    expect(events.map(event => event.label)).toContain('Prepare dataset state (0/5)')
    expect(events.map(event => event.label)).toContain('Prepare normalised rows (2/5)')
    expect(events.map(event => event.label)).toContain(
      'Prepare current SQL state (5/5)',
    )
    expect(events.map(event => event.label)).toContain('Import SQL (0/1)')
    expect(controlEvents).toEqual([
      'running:processDataset',
      'completed:normaliseAddressSql',
      'completed:generateAddressSqlCurrent',
      'running:importAddressSqlSource',
    ])
  })
})

function stripAnsi(value: string) {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
}
