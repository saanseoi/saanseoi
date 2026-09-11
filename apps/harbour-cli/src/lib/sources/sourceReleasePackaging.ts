import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { finished } from 'node:stream/promises'
import { join } from 'node:path'
import { Zip, ZipDeflate } from 'fflate'
import { inspectSourceAssetFile } from '../storage/sourceAssetFile.ts'

/** Package loose publisher files with bounded memory and a content-verified cache. */
export async function packageSourceReleaseFile(
  path: string,
  fileName: string,
  cacheDir: string,
) {
  const original = await inspectSourceAssetFile(path)
  // fflate emits ZIP32. Reject unsupported sizes before creating a partial archive.
  if (original.byteLength >= 0xffff_0000)
    throw new Error(
      'Loose source files of 4 GiB or more must be supplied as a publisher ZIP or Parquet.',
    )
  const key = createHash('sha256')
    .update(
      JSON.stringify({
        contract: 'streaming-zip-v1',
        fileName,
        sha256: original.sha256,
      }),
    )
    .digest('hex')
  const filePath = join(cacheDir, `${key}.zip`)
  const metadataPath = join(cacheDir, `${key}.json`)
  try {
    const receipt = JSON.parse(await readFile(metadataPath, 'utf8'))
    const archive = await inspectSourceAssetFile(filePath)
    if (receipt.sha256 === archive.sha256 && receipt.originalSha256 === original.sha256)
      return { filePath, ...archive, original }
  } catch (error) {
    if (
      !(error instanceof SyntaxError) &&
      !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    )
      throw error
  }
  await mkdir(cacheDir, { recursive: true })
  const temporary = `${filePath}.${randomUUID()}.partial`
  const temporaryMetadata = `${temporary}.json`
  try {
    const output = createWriteStream(temporary, { highWaterMark: 64 * 1024 })
    const complete = finished(output)
    void complete.catch(() => {})
    const zip = new Zip((error, data, final) => {
      if (error) {
        output.destroy(error)
        return
      }
      output.write(data)
      if (final) output.end()
    })
    const entry = new ZipDeflate(fileName, { level: 6 })
    entry.mtime = new Date('1980-01-01T00:00:00.000Z')
    zip.add(entry)
    const digest = createHash('sha256')
    try {
      for await (const bytes of createReadStream(path, { highWaterMark: 64 * 1024 })) {
        digest.update(bytes)
        entry.push(bytes, false)
        if (output.writableNeedDrain) await once(output, 'drain')
        if (output.errored) throw output.errored
      }
      if (digest.digest('hex') !== original.sha256)
        throw new Error('Source file changed while packaging.')
      entry.push(new Uint8Array(), true)
      zip.end()
      await complete
    } catch (error) {
      output.destroy()
      await complete.catch(() => {})
      throw error
    }
    const archive = await inspectSourceAssetFile(temporary)
    await writeFile(
      temporaryMetadata,
      JSON.stringify({ sha256: archive.sha256, originalSha256: original.sha256 }),
    )
    await rename(temporary, filePath)
    await rename(temporaryMetadata, metadataPath)
    return { filePath, ...archive, original }
  } finally {
    await rm(temporary, { force: true })
    await rm(temporaryMetadata, { force: true })
  }
}
