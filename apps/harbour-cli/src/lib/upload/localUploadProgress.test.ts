import { describe, expect, mock, test } from 'bun:test'

describe('LocalUploadProgress', () => {
  test('includes the underlying error in a failed phase label', async () => {
    const stoppedLabels: string[] = []
    mock.module('@clack/prompts', () => ({
      progress() {
        return {
          advance() {},
          clear() {},
          message() {},
          start() {},
          stop(label: string) {
            stoppedLabels.push(label)
          },
        }
      },
    }))

    const { LocalUploadProgress } = await import('./localUploadProgress.ts')
    const progress = new LocalUploadProgress()
    progress.beginPhase('Calculate release statistics', {})
    progress.fail(new Error('database is locked'))

    expect(stoppedLabels).toEqual([
      'Failed during Calculate release statistics: database is locked',
    ])
  })
})
