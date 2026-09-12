import { AsyncLocalStorage } from 'node:async_hooks'

type Capture = (
  target: { databaseId: string | null },
  bytes: Uint8Array,
) => Promise<void>
const captures = new AsyncLocalStorage<{
  capture: Capture
  closed: boolean
  local: boolean
}>()

/** Explicit SQL-only scope: no D1 SQL or local replay may execute while a phase is sealed. */
export async function withSqlDeliveryCapture(
  capture: Capture,
  generate: () => Promise<unknown>,
  local = false,
) {
  if (captures.getStore())
    throw new Error('Nested SQL delivery capture is not supported.')
  const state = { capture, closed: false, local }
  try {
    await captures.run(state, generate)
  } finally {
    state.closed = true
  }
}

export async function captureSqlDeliveryBytes(
  target: { databaseId: string | null; binding?: object },
  bytes: Uint8Array,
  isLocal: boolean,
) {
  const state = captures.getStore()
  if (!state) return false
  if (state.closed) throw new Error('SQL delivery capture has already stopped.')
  if (state.local) {
    if (!isLocal)
      throw new Error('Remote SQL is not allowed inside a native local delivery phase.')
    const bindingName =
      target.binding && 'bindingName' in target.binding
        ? target.binding.bindingName
        : undefined
    if (typeof bindingName !== 'string' || !bindingName)
      throw new Error('Native SQL capture requires an identified local binding.')
    await state.capture({ databaseId: bindingName }, bytes)
    return true
  }
  // Legacy replay functions enumerate local and remote copies. Only the remote
  // payload is retained; the exact same sealed bytes will later repair the mirror.
  if (!isLocal) await state.capture(target, bytes)
  return true
}
