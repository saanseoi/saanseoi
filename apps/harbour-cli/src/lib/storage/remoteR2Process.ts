import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { R2Metadata } from './remoteR2Object.ts'

type Reply = { type: string; id?: number; operation?: string; message?: string }

/** Persistent Node subprocess with bounded startup, requests and shutdown. */
export function startR2Process(
  configPath: string,
  options: {
    workerPath?: string
    startupTimeoutMs?: number
    requestTimeoutMs?: number
    onProgress?: (message: string) => void
  } = {},
) {
  const child = fork(
    options.workerPath ??
      fileURLToPath(new URL('./remoteR2Worker.ts', import.meta.url)),
    [configPath],
    {
      execPath: 'node',
      execArgv: [],
      serialization: 'json',
      silent: true,
      detached: process.platform !== 'win32',
      env: process.env,
    },
  )
  child.stdout?.on('data', chunk => process.stdout.write(chunk))
  child.stderr?.on('data', chunk => process.stderr.write(chunk))
  let stopped = false
  let sequence = 0
  let rejectReady: (error: Error) => void = () => {}
  let resolveReady: () => void = () => {}
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  void ready.catch(() => {})
  const pending = new Map<
    number,
    {
      resolve(): void
      reject(error: Error): void
      timer: ReturnType<typeof setTimeout>
      key: string
      operation: string
    }
  >()
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const signal = (value: NodeJS.Signals) => {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, value)
      else child.kill(value)
    } catch {
      /* The owned process may already have exited. */
    }
  }
  const stop = () => {
    signal('SIGTERM')
    const timer = setTimeout(() => signal('SIGKILL'), 1_000)
    timer.unref()
  }
  const fail = (error: Error) => {
    if (stopped) return
    stopped = true
    clearTimeout(startupTimer)
    rejectReady(error)
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(error)
    }
    pending.clear()
    stop()
  }
  const startupTimer = setTimeout(
    () => fail(new Error('R2 connection timed out while starting the Node adapter.')),
    options.startupTimeoutMs ?? 45_000,
  )
  child.once('error', error =>
    fail(new Error(`Cannot start Node R2 adapter: ${error.message}`)),
  )
  child.once('exit', (code, sig) =>
    fail(new Error(`R2 adapter exited (${sig ?? code}).`)),
  )
  child.on('message', (reply: Reply) => {
    if (reply.type === 'ready') {
      clearTimeout(startupTimer)
      resolveReady()
      return
    }
    if (reply.type === 'fatal') {
      fail(new Error(`R2 connection failed: ${reply.message}`))
      return
    }
    const item = reply.id === undefined ? undefined : pending.get(reply.id)
    if (!item) return
    if (reply.type === 'progress') {
      item.operation = reply.operation ?? 'working'
      options.onProgress?.(`R2 ${item.operation}: ${item.key}`)
      return
    }
    clearTimeout(item.timer)
    pending.delete(reply.id as number)
    if (reply.type === 'done') item.resolve()
    else
      item.reject(
        new Error(`R2 ${item.operation} failed for ${item.key}: ${reply.message}`),
      )
  })
  let queue: Promise<unknown> = Promise.resolve()
  return {
    ready,
    retain(key: string, path: string, metadata: R2Metadata) {
      const result = queue.then(async () => {
        await ready
        if (stopped) throw new Error('R2 adapter is stopped.')
        const id = ++sequence
        return new Promise<void>((resolve, reject) => {
          const item = {
            resolve,
            reject,
            key,
            operation: 'reading local file',
            timer: setTimeout(() => {
              fail(
                new Error(
                  `R2 ${item.operation} timed out for ${key}; remote commit status is unknown. Retry verifies the object before writing.`,
                ),
              )
            }, options.requestTimeoutMs ?? 120_000),
          }
          pending.set(id, item)
          child.send({ id, key, path, metadata }, error => {
            if (error) fail(error)
          })
        })
      })
      queue = result.catch(() => {})
      return result
    },
    stop() {
      fail(new Error('R2 adapter stopped.'))
    },
    async dispose() {
      fail(new Error('R2 adapter closed.'))
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          exited,
          new Promise<void>(resolve => {
            timer = setTimeout(resolve, 2_000)
          }),
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
  }
}
