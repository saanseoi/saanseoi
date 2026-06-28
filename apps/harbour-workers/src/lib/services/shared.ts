export type DataShardEnvironment = 'preview' | 'production'

export type OperationTimingSummary = Record<string, number>

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
