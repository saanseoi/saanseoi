import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'

/** Failed or ambiguous storage reads must not erase a verified local artefact. */
export async function downloadTilesObject(
  path: string,
  download: (
    temporaryPath: string,
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>,
) {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.download-${randomUUID()}`,
  )
  try {
    const result = await download(temporaryPath)
    if (result.exitCode === 0) {
      await rename(temporaryPath, path)
      return true
    }
    // This is Wrangler's explicit R2 object-get missing-key diagnostic. Generic
    // "not found" can instead refer to an account, bucket, binary or configuration.
    if (/The specified key does not exist\./.test(`${result.stderr}\n${result.stdout}`))
      return false
    throw new Error(
      `Basemap object download failed (${result.exitCode}): ${result.stderr.trim() || result.stdout.trim() || 'no diagnostic output; remote object state is unknown'}`,
    )
  } finally {
    await rm(temporaryPath, { force: true })
  }
}
