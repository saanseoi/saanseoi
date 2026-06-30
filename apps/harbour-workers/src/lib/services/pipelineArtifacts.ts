import type { DatasetProcessingMessage } from '@repo/core'

type ArtifactObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>
}

export type PipelineArtifactBucket = {
  get(key: string): Promise<ArtifactObjectBody | null>
  put?(
    key: string,
    value: string | ArrayBuffer,
    options?: {
      httpMetadata?: {
        contentType?: string
      }
    },
  ): Promise<unknown>
}

const localArtifacts = new Map<string, string>()
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function buildPipelineArtifactKey(
  message: DatasetProcessingMessage,
  stage: string,
  rowStart: number,
  rowEnd: number,
) {
  const releaseId = message.releaseId ?? message.datasetId
  return [
    'processed',
    message.type,
    releaseId,
    stage,
    `${String(rowStart).padStart(12, '0')}-${String(rowEnd).padStart(12, '0')}.json`,
  ].join('/')
}

export async function writeJsonArtifact<T>(
  bucket: PipelineArtifactBucket,
  key: string,
  value: T,
) {
  const body = JSON.stringify(value)

  if (bucket.put) {
    await bucket.put(key, body, {
      httpMetadata: {
        contentType: 'application/json',
      },
    })
    return
  }

  localArtifacts.set(key, body)
}

export async function readJsonArtifact<T>(
  bucket: PipelineArtifactBucket,
  key: string,
): Promise<T> {
  if (!bucket.put && localArtifacts.has(key)) {
    return JSON.parse(localArtifacts.get(key) ?? 'null') as T
  }

  const object = await bucket.get(key)

  if (!object) {
    throw new Error(`Pipeline artifact not found: ${key}`)
  }

  const buffer = await object.arrayBuffer()
  return JSON.parse(textDecoder.decode(buffer)) as T
}

export function createLocalArtifactObject(value: unknown): ArtifactObjectBody {
  const body = JSON.stringify(value)
  const bytes = textEncoder.encode(body)

  return {
    async arrayBuffer() {
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer
    },
  }
}
