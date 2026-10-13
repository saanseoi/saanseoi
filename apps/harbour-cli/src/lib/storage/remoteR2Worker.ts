// Wrangler binding RPC stalls under Bun; run this adapter with Node >=22.18.
import { createWriteStream, readFileSync, readdirSync, rmSync } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { readRemoteObject } from './remoteR2Multipart.ts'
import { getPlatformProxy } from 'wrangler'
import { retainSourceFileInBucket } from './remoteR2SourceFile.ts'
import { retryRemoteR2 } from './remoteR2Retry.ts'
import type { SourceAssetStore } from '../../../../../libs/core/src/lib/services/sourceAssetTransfer.ts'
import {
  retainObjectInBucket,
  type RemoteR2Bucket,
  type R2Metadata,
} from './remoteR2Object.ts'

const configPath = process.argv[2] ?? ''
const requestDirectory = process.argv[3] ?? ''
const persistPath = process.argv[4]
if (!configPath || !requestDirectory)
  throw new Error('R2 worker requires a config and request directory.')
type Request = {
  id: number
  key: string
  path: string
  metadata: R2Metadata
  sourceFile?: boolean
  download?: boolean
}
const output = createWriteStream('', { fd: 3 })
const send = (value: object) => {
  output.write(`${JSON.stringify(value)}\n`)
}
let proxy:
  | Awaited<
      ReturnType<
        typeof getPlatformProxy<{ R2_ASSETS: RemoteR2Bucket & SourceAssetStore }>
      >
    >
  | undefined
let activeRequests = 0
let closing = false
let requestPoller: ReturnType<typeof setInterval> | undefined
async function close() {
  if (closing) return
  closing = true
  if (requestPoller) clearInterval(requestPoller)
  const deadline = setTimeout(() => process.exit(1), 5_000)
  try {
    await proxy?.dispose()
  } finally {
    clearTimeout(deadline)
    process.exit(0)
  }
}
process.once('SIGTERM', () => void close())
process.once('SIGINT', () => void close())

function consumeRequests(bucket: RemoteR2Bucket & SourceAssetStore) {
  for (const fileName of readdirSync(requestDirectory).sort()) {
    if (closing || activeRequests >= 4) break
    if (!fileName.endsWith('.json')) continue
    const requestPath = `${requestDirectory}/${fileName}`
    let request: Request
    try {
      request = JSON.parse(readFileSync(requestPath, 'utf8')) as Request
      rmSync(requestPath, { force: true })
    } catch (error) {
      send({
        type: 'fatal',
        message: `Cannot read R2 request: ${error instanceof Error ? error.message : String(error)}`,
      })
      void close()
      return
    }
    activeRequests++
    void (async () => {
      try {
        const progress = (operation: string) =>
          send({ type: 'progress', id: request.id, operation })
        // Restart retention with fresh bodies and verify persisted bytes/chunks first.
        await retryRemoteR2(async () => {
          if (request.download) {
            progress('downloading')
            const object = await bucket.head(request.key)
            if (!object)
              throw new Error(`Evidence archive object is missing: ${request.key}`)
            const file = await open(request.path, 'w')
            try {
              for await (const bytes of readRemoteObject(
                bucket,
                request.key,
                object.size,
                progress,
              ))
                await file.writeFile(bytes)
            } finally {
              await file.close()
            }
          } else if (request.sourceFile)
            await retainSourceFileInBucket(
              bucket,
              request.key,
              request.path,
              request.metadata,
              progress,
            )
          else
            await retainObjectInBucket(
              bucket,
              request.key,
              await readFile(request.path),
              request.metadata,
              progress,
            )
        }, progress)
        send({ type: 'done', id: request.id })
      } catch (error) {
        send({
          type: 'error',
          id: request.id,
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        activeRequests--
      }
    })()
  }
}
try {
  proxy = await getPlatformProxy<{ R2_ASSETS: RemoteR2Bucket & SourceAssetStore }>({
    configPath,
    persist: persistPath ? { path: persistPath } : false,
    remoteBindings: !persistPath,
  })
  const bucket = proxy.env.R2_ASSETS
  requestPoller = setInterval(() => consumeRequests(bucket), 10)
  send({ type: 'ready' })
} catch (error) {
  send({
    type: 'fatal',
    message: error instanceof Error ? error.message : String(error),
  })
  await close()
}
