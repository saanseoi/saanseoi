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

    const { LocalUploadProgress } = await import('../upload/localUploadProgress.ts')
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

  test('rejects invalid concurrency instead of returning sparse results', async () => {
    const { mapWithConcurrency } = await import('./orchestrator.ts')

    await expect(mapWithConcurrency([1], 0, async value => value)).rejects.toThrow(
      'Concurrency must be a positive integer.',
    )
  })

  test('maps with bounded concurrency while preserving input order', async () => {
    const { mapWithConcurrency } = await import('./orchestrator.ts')
    let activeWorkers = 0
    let maximumActiveWorkers = 0

    const results = await mapWithConcurrency([30, 10, 20, 0], 2, async value => {
      activeWorkers += 1
      maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers)
      await Bun.sleep(value)
      activeWorkers -= 1
      return value / 10
    })

    expect(maximumActiveWorkers).toBe(2)
    expect(results).toEqual([3, 1, 2, 0])
  })

  test('serialises concurrent generation progress writes', async () => {
    const { runLocalGenerationPhase } = await import('./orchestrator.ts')
    const committedRows: number[] = []
    const progress = {
      beginPhase() {},
      complete() {},
      update() {},
    }
    const harbourClient = {
      async publishDataset() {},
      async stageCompleted() {},
      async stageFailed() {},
      async stageRunning(
        _releaseId: string,
        _phase: string,
        stats?: Record<string, unknown>,
      ) {
        const processedRows = Number(stats?.processedRows ?? 0)
        if (processedRows === 1) await Bun.sleep(10)
        committedRows.push(processedRows)
      },
    }

    await runLocalGenerationPhase(
      progress as never,
      harbourClient,
      {
        completionLabel: 'complete',
        label: 'running',
        labelForProgress: current => `running ${current}`,
        phase: 'generate',
        releaseCode: 'release-code',
        releaseId: 'release-id',
        totalUnits: 2,
        unitsForMessage: () => 1,
      },
      [1, 2],
      2,
      async value => value,
    )

    expect(committedRows).toEqual([0, 1, 2])
  })
})

function stripAnsi(value: string) {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
}
