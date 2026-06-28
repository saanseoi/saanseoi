export type DataShardEnvironment = 'preview' | 'production'

export type OperationTimingSummary = Record<string, number>

export function createOperationTimer() {
  const totals = new Map<string, number>()

  return {
    async measure<T>(name: string, operation: () => Promise<T> | T): Promise<T> {
      const startedAt = Date.now()

      try {
        return await operation()
      } finally {
        totals.set(name, (totals.get(name) ?? 0) + (Date.now() - startedAt))
      }
    },
    snapshot(): OperationTimingSummary {
      return Object.fromEntries(
        [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)),
      )
    },
  }
}

export function resolveDataShardEnvironment(
  configuredEnvironment: string | undefined,
): DataShardEnvironment {
  return configuredEnvironment === 'production' ? 'production' : 'preview'
}
