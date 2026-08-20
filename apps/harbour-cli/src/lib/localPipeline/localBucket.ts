import { copyFile, mkdir, open, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

type RangeOptions = {
  range?: {
    offset: number
    length: number
  }
}

type StoredObject = {
  arrayBuffer(): Promise<ArrayBuffer>
  etag?: string
  httpEtag?: string
}

export class LocalPipelineBucket {
  constructor(private readonly rootDir: string) {}

  async seedRawObject(key: string, sourceFilePath: string) {
    const destinationPath = this.resolvePath(key)

    await mkdir(dirname(destinationPath), { recursive: true })
    await copyFile(sourceFilePath, destinationPath)
  }

  async head(key: string) {
    const filePath = this.resolvePath(key)

    try {
      const fileStat = await stat(filePath)
      return {
        size: fileStat.size,
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return null
      }

      throw error
    }
  }

  async get(key: string, options?: RangeOptions): Promise<StoredObject | null> {
    const filePath = this.resolvePath(key)

    try {
      const chunk = options?.range
        ? await readFileRange(filePath, options.range)
        : await readFile(filePath)

      return {
        async arrayBuffer() {
          return chunk.buffer.slice(
            chunk.byteOffset,
            chunk.byteOffset + chunk.byteLength,
          ) as ArrayBuffer
        },
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return null
      }

      throw error
    }
  }

  async put(
    key: string,
    value: string | ArrayBuffer,
    _options?: {
      httpMetadata?: {
        contentType?: string
      }
    },
  ) {
    const filePath = this.resolvePath(key)
    const buffer = typeof value === 'string' ? value : Buffer.from(value)

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, buffer)
  }

  resolvePath(key: string) {
    const objectsRoot = resolve(this.rootDir, 'objects')
    const filePath = resolve(objectsRoot, key)

    if (!filePath.startsWith(`${objectsRoot}${sep}`)) {
      throw new Error(`Invalid local pipeline object key: ${key}`)
    }

    return filePath
  }
}

async function readFileRange(
  filePath: string,
  range: NonNullable<RangeOptions['range']>,
) {
  const file = await open(filePath, 'r')
  try {
    const fileSize = (await file.stat()).size
    const offset = Math.min(fileSize, normaliseRangeValue(range.offset))
    const available = fileSize - offset
    const length = Math.min(available, normaliseRangeValue(range.length))
    const chunk = Buffer.allocUnsafe(length)
    const { bytesRead } = await file.read(chunk, 0, length, offset)
    return chunk.subarray(0, bytesRead)
  } finally {
    await file.close()
  }
}

function normaliseRangeValue(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function isMissingFileError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === 'ENOENT'
  )
}
