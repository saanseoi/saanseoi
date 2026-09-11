// Wrangler binding RPC stalls under Bun; run this adapter with Node >=22.18.
import { createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { readFile } from 'node:fs/promises'
import { getPlatformProxy } from 'wrangler'
import {
  retainObjectInBucket,
  type RemoteR2Bucket,
  type R2Metadata,
} from './remoteR2Object.ts'

const configPath = process.argv[2]
if (!configPath) throw new Error('R2 worker requires a config and IPC channel.')
type Request = { id: number; key: string; path: string; metadata: R2Metadata }
const output = createWriteStream('', { fd: 3 })
const input = createInterface({ input: process.stdin })
const send = (value: object) => {
  output.write(`${JSON.stringify(value)}\n`)
}
let proxy:
  | Awaited<ReturnType<typeof getPlatformProxy<{ R2_ASSETS: RemoteR2Bucket }>>>
  | undefined
let chain = Promise.resolve()
async function close() {
  const deadline = setTimeout(() => process.exit(1), 5_000)
  try {
    await proxy?.dispose()
  } finally {
    clearTimeout(deadline)
    process.exit(0)
  }
}
input.on('close', () => {
  void close()
})
try {
  proxy = await getPlatformProxy<{ R2_ASSETS: RemoteR2Bucket }>({
    configPath,
    persist: false,
    remoteBindings: true,
  })
  const bucket = proxy.env.R2_ASSETS
  input.on('line', line => {
    const request: Request = JSON.parse(line)
    chain = chain.then(async () => {
      try {
        const bytes = await readFile(request.path)
        await retainObjectInBucket(
          bucket,
          request.key,
          bytes,
          request.metadata,
          operation => send({ type: 'progress', id: request.id, operation }),
        )
        send({ type: 'done', id: request.id })
      } catch (error) {
        send({
          type: 'error',
          id: request.id,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
  })
  send({ type: 'ready' })
} catch (error) {
  send({
    type: 'fatal',
    message: error instanceof Error ? error.message : String(error),
  })
  await close()
}
