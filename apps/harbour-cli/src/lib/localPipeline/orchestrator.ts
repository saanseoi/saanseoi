import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { HarbourClient } from '@repo/core/pipeline/harbourClient'

import type { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  appendPhaseDetails,
  formatBytes,
  formatCount,
  formatDurationMs,
  formatRunningPhaseLabel,
  colorRed,
  colorTeal,
} from './progressFormatting.ts'

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

const PRE_IMPORT_PHASES = [
  'processDataset',
  'normaliseAddressSql',
  'generateAddressSqlSource',
  'generateAddressSqlHistory',
  'generateAddressSqlCurrent',
] as const

export async function runLocalGenerationPhase<TMessage>(
  progress: LocalUploadProgress,
  harbourClient: HarbourClient,
  phase: LocalGenerationPhase<TMessage>,
  messages: TMessage[],
  concurrency: number,
  worker: (message: TMessage) => Promise<TMessage>,
) {
  let processedUnits = 0
  const startedAt = Date.now()

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
  progress.complete(
    appendPhaseDetails(phase.completionLabel, [
      formatDurationMs(Date.now() - startedAt),
    ]),
  )
  return results
}

export async function runLocalStreamingPhase<TResult>(
  progress: LocalUploadProgress,
  harbourClient: HarbourClient,
  phase: LocalStreamingPhase,
  operation: (reportProgress: (current: number) => Promise<void>) => Promise<TResult>,
) {
  let currentUnits = 0
  const startedAt = Date.now()

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

  progress.complete(
    appendPhaseDetails(phase.completionLabel, [
      formatDurationMs(Date.now() - startedAt),
    ]),
  )
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
  let preImportProgress = 0
  let importStartedAt: number | null = null
  const completedImportDetailsByPhase = new Map<string, string>()
  const phaseStartedAt = new Map<string, number>()

  return {
    ...harbourClient,
    async publishDataset(releaseId, releaseCode, options) {
      return harbourClient.publishDataset(releaseId, releaseCode, options)
    },
    async stageCompleted(releaseId, phase, stats, releaseCode) {
      const importPhase = importPhasesByName.get(phase)
      const completedDetails = formatCompletedStatsDetails(
        stats,
        phaseStartedAt.get(phase),
      )

      if (importPhase) {
        const phaseDetails = formatImportPhaseDetails(
          phase,
          stats,
          phaseStartedAt.get(phase),
        )

        if (phaseDetails) {
          completedImportDetailsByPhase.set(phase, phaseDetails)
        }

        importProgressByPhase.set(phase, importPhase.totalUnits)
        const totalProgress = sumImportProgress(importProgressByPhase)

        progress.update(totalProgress, {
          label: importPhase.runningLabel(totalProgress),
          max: totalImportUnits,
        })

        if (totalProgress >= totalImportUnits) {
          progress.complete(
            appendPhaseDetails(importPhase.completedLabel, [
              formatDurationMs(
                importStartedAt ? Date.now() - importStartedAt : Number.NaN,
              ),
              formatImportBreakdown(config.importPhases, completedImportDetailsByPhase),
            ]),
          )
        }
      } else if (phase === config.cleanup.phase) {
        progress.update(config.cleanup.totalUnits, {
          label: config.cleanup.runningLabel(config.cleanup.totalUnits),
          max: config.cleanup.totalUnits,
        })
        progress.complete(
          appendPhaseDetails(config.cleanup.completedLabel, completedDetails),
        )
      } else if (phase === config.publish.phase) {
        progress.update(config.publish.totalUnits, {
          label: config.publish.runningLabel(config.publish.totalUnits),
          max: config.publish.totalUnits,
        })
        progress.complete(
          appendPhaseDetails(config.publish.completedLabel, completedDetails),
        )
      } else if (activeLocalPhase === null && isPreImportPhase(phase)) {
        preImportProgress = Math.max(
          preImportProgress,
          resolvePreImportPhaseProgress(phase),
        )
        progress.update(preImportProgress, {
          label: formatPreImportProgressLabel(phase, preImportProgress),
          max: PRE_IMPORT_PHASES.length,
        })
      }

      return harbourClient.stageCompleted(releaseId, phase, stats, releaseCode)
    },
    async stageFailed(releaseId, phase, error, stats, releaseCode) {
      progress.fail(`${phase}: ${error}`)
      return harbourClient.stageFailed(releaseId, phase, error, stats, releaseCode)
    },
    async stageRunning(releaseId, phase, stats, releaseCode) {
      const importPhase = importPhasesByName.get(phase)
      if (!phaseStartedAt.has(phase)) {
        phaseStartedAt.set(phase, Date.now())
      }

      if (importPhase) {
        if (activeLocalPhase !== 'import') {
          activeLocalPhase = 'import'
          importStartedAt = Date.now()
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
      } else if (activeLocalPhase === null && isPreImportPhase(phase)) {
        if (!progress.hasActivePhase()) {
          progress.beginPhase(formatPreImportProgressLabel(phase, preImportProgress), {
            current: preImportProgress,
            max: PRE_IMPORT_PHASES.length,
          })
        } else {
          progress.update(preImportProgress, {
            label: formatPreImportProgressLabel(phase, preImportProgress),
            max: PRE_IMPORT_PHASES.length,
          })
        }
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

function formatCompletedStatsDetails(
  stats: Record<string, unknown> | undefined,
  startedAt: number | undefined,
) {
  const durationMs =
    typeof stats?.durationMs === 'number'
      ? stats.durationMs
      : startedAt
        ? Date.now() - startedAt
        : undefined
  const bytes = typeof stats?.bytes === 'number' ? formatBytes(stats.bytes) : null
  const fileCount =
    typeof stats?.fileCount === 'number'
      ? `${formatCount(stats.fileCount)} files`
      : null

  return [formatDurationMs(durationMs ?? Number.NaN), bytes, fileCount]
}

function formatImportPhaseDetails(
  phase: string,
  stats: Record<string, unknown> | undefined,
  startedAt: number | undefined,
) {
  const durationMs =
    typeof stats?.durationMs === 'number'
      ? stats.durationMs
      : startedAt
        ? Date.now() - startedAt
        : undefined
  const details = [
    formatDurationMs(durationMs ?? Number.NaN),
    typeof stats?.bytes === 'number' ? formatBytes(stats.bytes) : null,
    typeof stats?.fileCount === 'number'
      ? `${formatCount(stats.fileCount)} files`
      : null,
  ].filter((detail): detail is string => Boolean(detail))

  if (details.length === 0) {
    return null
  }

  return `${formatImportPhaseName(phase)} ${details.join(' ')}`
}

function formatImportBreakdown(
  phases: LocalImportProgressPhase[],
  detailsByPhase: Map<string, string>,
) {
  const details = phases
    .map(phase => detailsByPhase.get(phase.phase))
    .filter((detail): detail is string => Boolean(detail))

  return details.length > 0 ? details.join('; ') : null
}

function formatImportPhaseName(phase: string) {
  return phase
    .replace(/^import(?:Address|Division)Sql/, '')
    .replace(/Stats$/, 'meta')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
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

function isPreImportPhase(phase: string) {
  return PRE_IMPORT_PHASES.includes(phase as (typeof PRE_IMPORT_PHASES)[number])
}

function resolvePreImportPhaseProgress(phase: string) {
  const index = PRE_IMPORT_PHASES.indexOf(phase as (typeof PRE_IMPORT_PHASES)[number])

  return index < 0 ? 0 : index + 1
}

function formatPreImportProgressLabel(phase: string, current: number) {
  return formatRunningPhaseLabel(
    colorTeal('Prepare'),
    colorRed(describePreImportPhase(phase)),
    current,
    PRE_IMPORT_PHASES.length,
  )
}

function describePreImportPhase(phase: string) {
  switch (phase) {
    case 'processDataset':
      return 'dataset state'
    case 'normaliseAddressSql':
      return 'normalised rows'
    case 'generateAddressSqlSource':
      return 'source SQL state'
    case 'generateAddressSqlHistory':
      return 'history SQL state'
    case 'generateAddressSqlCurrent':
      return 'current SQL state'
    default:
      return 'SQL import state'
  }
}
