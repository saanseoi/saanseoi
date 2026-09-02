import { describe, expect, mock, test } from 'bun:test'

describe('LocalUploadProgress', () => {
  test('includes the underlying error in a failed phase label', async () => {
    const stoppedLabels: string[] = []
    const rendererKinds: string[] = []
    const staticLabels: Array<[string, string]> = []
    const createRenderer = (kind: string) => {
      rendererKinds.push(kind)
      return {
        advance() {},
        clear() {},
        message() {},
        start() {},
        stop(label: string) {
          stoppedLabels.push(label)
        },
      }
    }
    mock.module('@clack/prompts', () => ({
      progress() {
        return createRenderer('progress')
      },
      spinner() {
        return createRenderer('spinner')
      },
      log: {
        error(label: string) {
          staticLabels.push(['error', label])
        },
        step(label: string) {
          staticLabels.push(['step', label])
        },
        success(label: string) {
          staticLabels.push(['success', label])
        },
      },
    }))

    const { LocalUploadProgress } = await import('./localUploadProgress.ts')
    const progress = new LocalUploadProgress({ renderAnimated: true })
    progress.beginPhase('Calculate release statistics', {})
    progress.fail(new Error('database is locked'))

    expect(stoppedLabels).toEqual([
      'Failed during Calculate release statistics: database is locked',
    ])
    expect(rendererKinds).toEqual(['spinner'])

    const staticProgress = new LocalUploadProgress({ renderAnimated: false })
    staticProgress.beginPhase('Normalise records', { max: null })
    staticProgress.update(1, {
      label: 'Normalise records (182,441)',
      max: 182_441,
      reset: true,
    })
    staticProgress.complete('Normalise records (182,441) (7.32 s)')

    expect(staticLabels).toEqual([
      ['step', 'Normalise records'],
      ['success', 'Normalise records (182,441) (7.32 s)'],
    ])
    expect(staticProgress.hasActivePhase()).toBe(false)
  })
})
