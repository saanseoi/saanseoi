import { describe, expect, test } from 'bun:test'

describe('LocalUploadProgress', () => {
  test('includes the underlying error in a failed phase label', async () => {
    const stoppedLabels: string[] = []
    const rendererKinds: string[] = []
    const staticLabels: Array<[string, string]> = []
    const createRenderer = (kind: string) => {
      rendererKinds.push(kind)
      return {
        isCancelled: false,
        cancel() {},
        advance() {},
        clear() {},
        message() {},
        start() {},
        error(label: string) {
          stoppedLabels.push(label)
        },
        stop() {},
      }
    }
    const ui = {
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
    }

    const { LocalUploadProgress } = await import('./localUploadProgress.ts')
    const progress = new LocalUploadProgress({ renderAnimated: true, ui })
    progress.beginPhase('Calculate release statistics', {})
    progress.fail(new Error('database is locked'))

    expect(stoppedLabels).toEqual([
      'Failed during Calculate release statistics: database is locked',
    ])
    expect(rendererKinds).toEqual(['spinner'])

    const staticProgress = new LocalUploadProgress({ renderAnimated: false, ui })
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

    const compactLabelsStart = staticLabels.length
    const compactProgress = new LocalUploadProgress({
      ui,
      compact: true,
      renderAnimated: false,
    })
    compactProgress.beginPhase('Prepare workspace', {})
    compactProgress.beginPhase('Read Places (0/10)', { current: 0, max: 10 })
    compactProgress.update(10, { label: 'Read Places (10/10)' })
    compactProgress.complete('Read Places complete')
    compactProgress.finish('Places processing complete')

    expect(staticLabels.slice(compactLabelsStart)).toEqual([
      ['success', 'Places processing complete'],
    ])
  })
})
