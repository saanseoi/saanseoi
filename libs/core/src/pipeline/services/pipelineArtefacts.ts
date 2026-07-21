import type { DatasetProcessingMessage } from '../../types'

type ArtefactObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>
  etag?: string
  httpEtag?: string
}

export type PipelineArtefactBucket = {
  get(key: string): Promise<ArtefactObjectBody | null>
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

const localArtefacts = new Map<string, string>()
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function buildPipelineArtefactKey(
  message: DatasetProcessingMessage,
  stage: string,
  rowStart: number,
  rowEnd: number,
) {
  const releaseId = message.releaseCode ?? message.releaseId ?? message.datasetId
  return [
    'processed',
    message.type,
    releaseId,
    stage,
    `${String(rowStart).padStart(12, '0')}-${String(rowEnd).padStart(12, '0')}.json`,
  ].join('/')
}

export function buildSqlPipelineArtefactKey(
  message: DatasetProcessingMessage,
  target: string,
  filename: string,
) {
  const releaseCode = message.releaseCode ?? message.releaseId ?? message.datasetId

  return ['processed', releaseCode, 'sql', target, filename].join('/')
}

export async function writeJsonArtefact<T>(
  bucket: PipelineArtefactBucket,
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

  localArtefacts.set(key, body)
}

export async function writeTextArtefact(
  bucket: PipelineArtefactBucket,
  key: string,
  value: string,
  contentType = 'text/plain; charset=utf-8',
) {
  if (bucket.put) {
    await bucket.put(key, value, {
      httpMetadata: {
        contentType,
      },
    })
    return
  }

  localArtefacts.set(key, value)
}

export async function readJsonArtefact<T>(
  bucket: PipelineArtefactBucket,
  key: string,
): Promise<T> {
  if (!bucket.put && localArtefacts.has(key)) {
    return JSON.parse(localArtefacts.get(key) ?? 'null') as T
  }

  const object = await bucket.get(key)

  if (!object) {
    throw new Error(`Pipeline artefact not found: ${key}`)
  }

  const buffer = await object.arrayBuffer()
  return JSON.parse(textDecoder.decode(buffer)) as T
}

export async function readArtefactBytes(bucket: PipelineArtefactBucket, key: string) {
  const object = await bucket.get(key)

  if (!object) {
    throw new Error(`Pipeline artefact not found: ${key}`)
  }

  const buffer = await object.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  return {
    bytes,
    etag: object.httpEtag ?? object.etag,
  }
}

export function createLocalArtefactObject(value: unknown): ArtefactObjectBody {
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
