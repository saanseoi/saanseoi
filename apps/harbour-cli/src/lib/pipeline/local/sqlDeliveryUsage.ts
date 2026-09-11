import type { SqlDeliveryCheckpoint, SqlDeliveryProgress } from './sqlDeliveryTypes.ts'

export type D1RowUsage = { rowsRead: number; rowsWritten: number; complete: boolean }

export function readD1RowUsage(meta: unknown): D1RowUsage {
  const value = meta as { rows_read?: unknown; rows_written?: unknown } | undefined
  const valid = (n: unknown): n is number =>
    Number.isSafeInteger(n) && (n as number) >= 0
  return {
    rowsRead: valid(value?.rows_read) ? value.rows_read : 0,
    rowsWritten: valid(value?.rows_written) ? value.rows_written : 0,
    complete: valid(value?.rows_read) && valid(value?.rows_written),
  }
}

export function addD1RowUsage(state: SqlDeliveryCheckpoint, usage: D1RowUsage) {
  const previous = state.rowUsage ?? { rowsRead: 0, rowsWritten: 0, complete: true }
  state.rowUsage = {
    rowsRead: previous.rowsRead + usage.rowsRead,
    rowsWritten: previous.rowsWritten + usage.rowsWritten,
    complete: previous.complete && usage.complete,
  }
}

/** Missing acknowledgements and older checkpoints are unknown, never zero-cost. */
export function summariseD1RowUsage(
  progress: SqlDeliveryProgress,
  totalBatches: number,
) {
  const states = Object.values(progress.remote)
  return {
    rowsRead: states.reduce((n, state) => n + (state.rowUsage?.rowsRead ?? 0), 0),
    rowsWritten: states.reduce((n, state) => n + (state.rowUsage?.rowsWritten ?? 0), 0),
    measuredBatches: states.filter(state => state.rowUsage).length,
    complete:
      states.length === totalBatches &&
      states.every(
        state =>
          state.status === 'complete' &&
          state.rowUsage?.complete === true &&
          !state.usagePending,
      ),
    scope:
      'delivery statements and source retirement; excludes receipt verification reads',
  }
}
