import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { HarbourClient } from '@repo/core/pipeline/harbourClient'

import type { LocalUploadProgress } from '../localUploadProgress.ts'

export type LocalGenerationPhase<TMessage> = {
  completionLabel: string
  label: string
  labelForProgress(current: number): string
  phase: string
  releaseCode: string
  releaseId: string
  totalUnits: number
  unitsForMessage(message: TMessage): number
}

export type LocalStreamingPhase = {
  completionLabel: string
  label: string
  labelForProgress(current: number): string
  phase: string
  releaseCode: string
  releaseId: string
  totalUnits: number
}

export type LocalImportProgressPhase = {
  completedLabel: string
  phase: string
  runningLabel(current: number): string
  totalUnits: number
}

export type LocalImportProgressConfig = {
  cleanup: {
    completedLabel: string
    phase: string
    runningLabel(current: number): string
    totalUnits: number
  }
  importPhases: LocalImportProgressPhase[]
  publish: {
    completedLabel: string
    phase: string
    runningLabel(current: number): string
    totalUnits: number
  }
}

export async function runLocalGenerationPhase<TMessage>(
  progress: LocalUploadProgress,
  harbourClient: HarbourClient,
  phase: LocalGenerationPhase<TMessage>,
  messages: TMessage[],
  concurrency: number,
  worker: (message: TMessage) => Promise<TMessage>,
) {
  let processedUnits = 0

  progress.beginPhase(phase.label, {
    current: 0,
    max: phase.totalUnits,
  })
  await harbourClient.stageRunning(
    phase.releaseId,
    phase.phase,
    {
      processedRows: 0,
    },
    phase.releaseCode,
  )

  const results = await mapWithConcurrency(messages, concurrency, async message => {
    const result = await worker(message)

    processedUnits += Math.max(0, phase.unitsForMessage(message))
    const current = Math.min(processedUnits, phase.totalUnits)

    progress.update(current, {
      label: phase.labelForProgress(current),
    })
    await harbourClient.stageRunning(
      phase.releaseId,
      phase.phase,
      {
        processedRows: current,
      },
      phase.releaseCode,
    )

    return result
  })

  progress.update(phase.totalUnits, {
    label: phase.labelForProgress(phase.totalUnits),
  })
  progress.complete(phase.completionLabel)
  return results
}

export async function runLocalStreamingPhase<TResult>(
  progress: LocalUploadProgress,
  harbourClient: HarbourClient,
  phase: LocalStreamingPhase,
  operation: (reportProgress: (current: number) => Promise<void>) => Promise<TResult>,
) {
  let currentUnits = 0

  progress.beginPhase(phase.label, {
    current: 0,
    max: phase.totalUnits,
  })
  await harbourClient.stageRunning(
    phase.releaseId,
    phase.phase,
    {
      processedRows: 0,
    },
    phase.releaseCode,
  )

  const reportProgress = async (current: number) => {
    currentUnits = Math.min(Math.max(0, Math.floor(current)), phase.totalUnits)
    progress.update(currentUnits, {
      label: phase.labelForProgress(currentUnits),
    })
    await harbourClient.stageRunning(
      phase.releaseId,
      phase.phase,
      {
        processedRows: currentUnits,
      },
      phase.releaseCode,
    )
  }

  const result = await operation(reportProgress)

  if (currentUnits < phase.totalUnits) {
    await reportProgress(phase.totalUnits)
  }

  progress.complete(phase.completionLabel)
  return result
}

export function createLocalImportProgressClient(
  harbourClient: HarbourClient,
  progress: LocalUploadProgress,
  config: LocalImportProgressConfig,
): HarbourClient {
  const importProgressByPhase = new Map<string, number>()
  const importPhasesByName = new Map(
    config.importPhases.map(phase => [phase.phase, phase] as const),
  )
  const totalImportUnits = config.importPhases.reduce(
    (sum, phase) => sum + phase.totalUnits,
    0,
  )
  let activeLocalPhase: 'cleanup' | 'import' | 'publish' | null = null

  return {
    ...harbourClient,
    async publishDataset(releaseId, releaseCode, options) {
      return harbourClient.publishDataset(releaseId, releaseCode, options)
    },
    async stageCompleted(releaseId, phase, stats, releaseCode) {
      const importPhase = importPhasesByName.get(phase)

      if (importPhase) {
        importProgressByPhase.set(phase, importPhase.totalUnits)
        const totalProgress = sumImportProgress(importProgressByPhase)

        progress.update(totalProgress, {
          label: importPhase.runningLabel(totalProgress),
          max: totalImportUnits,
        })

        if (totalProgress >= totalImportUnits) {
          progress.complete(importPhase.completedLabel)
        }
      } else if (phase === config.cleanup.phase) {
        progress.update(config.cleanup.totalUnits, {
          label: config.cleanup.runningLabel(config.cleanup.totalUnits),
          max: config.cleanup.totalUnits,
        })
        progress.complete(config.cleanup.completedLabel)
      } else if (phase === config.publish.phase) {
        progress.update(config.publish.totalUnits, {
          label: config.publish.runningLabel(config.publish.totalUnits),
          max: config.publish.totalUnits,
        })
        progress.complete(config.publish.completedLabel)
      }

      return harbourClient.stageCompleted(releaseId, phase, stats, releaseCode)
    },
    async stageFailed(releaseId, phase, error, stats, releaseCode) {
      progress.fail(`${phase}: ${error}`)
      return harbourClient.stageFailed(releaseId, phase, error, stats, releaseCode)
    },
    async stageRunning(releaseId, phase, stats, releaseCode) {
      const importPhase = importPhasesByName.get(phase)

      if (importPhase) {
        if (activeLocalPhase !== 'import') {
          activeLocalPhase = 'import'
          progress.beginPhase(importPhase.runningLabel(0), {
            current: 0,
            max: totalImportUnits,
          })
        }

        const processedUnits =
          typeof stats?.processedFiles === 'number' &&
          Number.isFinite(stats.processedFiles)
            ? stats.processedFiles
            : 0

        importProgressByPhase.set(
          phase,
          Math.min(processedUnits, importPhase.totalUnits),
        )
        const totalProgress = sumImportProgress(importProgressByPhase)

        progress.update(totalProgress, {
          label: importPhase.runningLabel(totalProgress),
          max: totalImportUnits,
        })
      } else if (phase === config.cleanup.phase) {
        if (activeLocalPhase !== 'cleanup') {
          activeLocalPhase = 'cleanup'
          progress.beginPhase(config.cleanup.runningLabel(0), {
            current: 0,
            max: config.cleanup.totalUnits,
          })
        }
      } else if (phase === config.publish.phase) {
        if (activeLocalPhase !== 'publish') {
          activeLocalPhase = 'publish'
          progress.beginPhase(config.publish.runningLabel(0), {
            current: 0,
            max: config.publish.totalUnits,
          })
        }
      }

      return harbourClient.stageRunning(releaseId, phase, stats, releaseCode)
    },
  }
}

export async function writeLocalPipelineState(
  releaseRoot: string,
  state: Record<string, unknown>,
) {
  const filePath = resolve(releaseRoot, 'state.json')

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(state, null, 2))
}

export async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(items.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        const item = items[index]

        nextIndex += 1
        if (item === undefined) {
          continue
        }

        results[index] = await worker(item, index)
      }
    }),
  )

  return results
}

function sumImportProgress(importProgressByPhase: Map<string, number>) {
  return [...importProgressByPhase.values()].reduce((sum, value) => sum + value, 0)
}
