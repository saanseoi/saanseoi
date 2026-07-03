export type DataShardEnvironment = 'preview' | 'production'

export type OperationTimingSummary = Record<string, number>

export type RuntimeMemoryUsage =
  | {
      source: 'process.memoryUsage'
      arrayBuffersBytes?: number
      externalBytes?: number
      heapTotalBytes?: number
      heapUsedBytes?: number
      rssBytes?: number
    }
  | {
      source: 'performance.memory'
      jsHeapSizeLimitBytes?: number
      totalJSHeapSizeBytes?: number
      usedJSHeapSizeBytes?: number
    }

type ProcessMemoryUsageResult = {
  arrayBuffers?: number
  external?: number
  heapTotal?: number
  heapUsed?: number
  rss?: number
}

type RuntimeWithOptionalMemoryApis = typeof globalThis & {
  performance?: typeof performance & {
    memory?: {
      jsHeapSizeLimit?: number
      totalJSHeapSize?: number
      usedJSHeapSize?: number
    }
  }
  process?: {
    memoryUsage?: () => ProcessMemoryUsageResult
  }
}

export function readRuntimeMemoryUsage(): RuntimeMemoryUsage | null {
  const runtime = globalThis as RuntimeWithOptionalMemoryApis
  const processMemoryUsage = runtime.process?.memoryUsage

  if (typeof processMemoryUsage === 'function') {
    const memory = processMemoryUsage()

    return {
      source: 'process.memoryUsage',
      arrayBuffersBytes: memory.arrayBuffers,
      externalBytes: memory.external,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      rssBytes: memory.rss,
    }
  }

  const performanceMemory = runtime.performance?.memory

  if (performanceMemory) {
    return {
      source: 'performance.memory',
      jsHeapSizeLimitBytes: performanceMemory.jsHeapSizeLimit,
      totalJSHeapSizeBytes: performanceMemory.totalJSHeapSize,
      usedJSHeapSizeBytes: performanceMemory.usedJSHeapSize,
    }
  }

  return null
}

export function createOperationTimer(enabled = false) {
  const totals = new Map<string, number>()

  return {
    async measure<T>(name: string, operation: () => Promise<T> | T): Promise<T> {
      if (!enabled) {
        return await operation()
      }

      const startedAt = Date.now()

      try {
        return await operation()
      } finally {
        totals.set(name, (totals.get(name) ?? 0) + (Date.now() - startedAt))
      }
    },
    snapshot(): OperationTimingSummary {
      if (!enabled) {
        return {}
      }

      return Object.fromEntries(
        [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)),
      )
    },
  }
}

export function resolveDebugEnabled(configuredDebug: string | undefined): boolean {
  const normalizedDebug = configuredDebug?.trim().toLowerCase()

  return normalizedDebug === '1' || normalizedDebug === 'true'
}

export function resolveDataShardEnvironment(
  configuredEnvironment: string | undefined,
): DataShardEnvironment {
  return configuredEnvironment === 'production' ? 'production' : 'preview'
}
