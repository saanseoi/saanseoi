import type { MultiDbBindings } from './bindings'

export const DEFAULT_D1_PLACEMENT_PROBE_ITERATIONS = 5
export const MAX_D1_PLACEMENT_PROBE_ITERATIONS = 100

export const saanseoiD1BindingNames = [
  'DB_META',
  'DB_CURRENT',
  'DB_HISTORY_HK_2025',
  'DB_HISTORY_HK_2026',
  'DB_SOURCE_HK_2025',
  'DB_SOURCE_HK_2026',
] as const

export type SaanseoiD1BindingName = (typeof saanseoiD1BindingNames)[number]

export type D1PlacementProbeStats = {
  avgMs: number
  maxMs: number
  minMs: number
  p50Ms: number
  p95Ms: number
}

export type D1PlacementProbeBindingResult = {
  binding: SaanseoiD1BindingName
  stats: D1PlacementProbeStats
  timingsMs: number[]
}

export type D1PlacementProbeResult = {
  bindings: D1PlacementProbeBindingResult[]
  iterations: number
  overall: D1PlacementProbeStats
  query: string
  totalQueries: number
}

const DEFAULT_D1_PLACEMENT_PROBE_QUERY = 'SELECT 1 AS ok'

export function parseD1PlacementProbeIterations(value: string | null | undefined) {
  if (value == null || value.trim().length === 0) {
    return DEFAULT_D1_PLACEMENT_PROBE_ITERATIONS
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed)) {
    throw new Error('`iterations` must be an integer.')
  }

  if (parsed < 1 || parsed > MAX_D1_PLACEMENT_PROBE_ITERATIONS) {
    throw new Error(
      `\`iterations\` must be between 1 and ${MAX_D1_PLACEMENT_PROBE_ITERATIONS}.`,
    )
  }

  return parsed
}

export async function runD1PlacementProbe(
  bindings: Pick<MultiDbBindings, SaanseoiD1BindingName>,
  options: {
    iterations: number
    query?: string
  },
): Promise<D1PlacementProbeResult> {
  const query = options.query ?? DEFAULT_D1_PLACEMENT_PROBE_QUERY
  const bindingResults: D1PlacementProbeBindingResult[] = []

  for (const bindingName of saanseoiD1BindingNames) {
    const db = bindings[bindingName]
    const timingsMs: number[] = []

    for (let index = 0; index < options.iterations; index += 1) {
      const startedAt = performance.now()

      try {
        const row = await db.prepare(query).first<{ ok?: number }>()

        if (row?.ok !== 1) {
          throw new Error(
            `Expected probe query to return ok=1, received ${row?.ok ?? 'null'}.`,
          )
        }
      } catch (error) {
        throw new Error(
          `D1 placement probe failed for ${bindingName} on iteration ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }

      timingsMs.push(roundMs(performance.now() - startedAt))
    }

    bindingResults.push({
      binding: bindingName,
      stats: summarizeTimings(timingsMs),
      timingsMs,
    })
  }

  const overallTimings = bindingResults.flatMap(result => result.timingsMs)

  return {
    bindings: bindingResults,
    iterations: options.iterations,
    overall: summarizeTimings(overallTimings),
    query,
    totalQueries: overallTimings.length,
  }
}

function summarizeTimings(timingsMs: number[]): D1PlacementProbeStats {
  if (timingsMs.length === 0) {
    throw new Error('Cannot summarize an empty timing sample.')
  }

  const sorted = [...timingsMs].sort((left, right) => left - right)
  const total = timingsMs.reduce((sum, value) => sum + value, 0)

  return {
    avgMs: roundMs(total / timingsMs.length),
    maxMs: roundMs(sorted.at(-1) ?? 0),
    minMs: roundMs(sorted[0] ?? 0),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  }
}

function percentile(sortedValues: number[], percentileValue: number) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
  )

  return roundMs(sortedValues[index] ?? 0)
}

function roundMs(value: number) {
  return Math.round(value * 1000) / 1000
}
