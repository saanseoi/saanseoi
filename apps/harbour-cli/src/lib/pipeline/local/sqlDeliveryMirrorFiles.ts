import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, open, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { deliveryFileSha256 } from './sqlDeliveryFiles.ts'
import type { SqlDeliveryPlan } from './sqlDeliveryTypes.ts'

export type AcknowledgedMirrorFile = {
  file: string
  mirrorFile: string
  sha256: string
}

function relativeFile(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    !isAbsolute(value) &&
    !value.split(/[\\/]/).some(part => !part || part === '.' || part === '..')
  )
}

/**
 * Verify and stage every owning plan's files before promoting any membership baseline.
 * The caller must hold the cache-wide lock and verify all local/remote acknowledgements.
 * File copies and checksum reads are streamed; large membership files stay off the JS heap.
 * Promotion is atomic per file. The pending marker blocks planning until a failed promotion
 * is retried, so a partially completed rename sequence cannot become a planning baseline.
 */
export async function acknowledgeSqlDeliveryMirrorFiles(
  plans: ReadonlyArray<{ directory: string; plan: SqlDeliveryPlan }>,
) {
  const files = new Map<
    string,
    { source: string; destination: string; sha256: string }
  >()
  for (const { directory, plan } of plans) {
    const entries: unknown = plan.outputs?.acknowledgedMirrorFiles
    if (entries === undefined) continue
    if (!Array.isArray(entries)) throw new Error('Invalid acknowledged mirror files.')
    for (const value of entries) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid acknowledged mirror file.')
      const entry = value as Partial<AcknowledgedMirrorFile>
      if (!relativeFile(entry.file) || !relativeFile(entry.mirrorFile))
        throw new Error('Invalid acknowledged mirror file path.')
      if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256))
        throw new Error('Invalid acknowledged mirror file checksum.')
      await assertNoChildSymlink(directory, entry.file)
      await assertNoChildSymlink(plan.context.cacheDir, entry.mirrorFile)
      const source = resolve(directory, entry.file)
      const destination = resolve(plan.context.cacheDir, entry.mirrorFile)
      if (!(await lstat(source)).isFile())
        throw new Error(`Retained mirror artefact is not a regular file: ${entry.file}`)
      const previous = files.get(destination)
      if (previous && previous.sha256 !== entry.sha256)
        throw new Error(`Conflicting acknowledged mirror files: ${entry.mirrorFile}`)
      if ((await deliveryFileSha256(source)) !== entry.sha256)
        throw new Error(`Retained mirror file checksum changed: ${entry.file}`)
      files.set(destination, { source, destination, sha256: entry.sha256 })
    }
  }
  const staged: Array<{ temporary: string; destination: string }> = []
  try {
    for (const entry of files.values()) {
      const parent = dirname(entry.destination)
      await mkdir(parent, { recursive: true })
      const temporary = join(
        parent,
        `.${basename(entry.destination)}.${randomUUID()}.tmp`,
      )
      // Register cleanup before copying: failed copies may leave partial temporary files.
      staged.push({ temporary, destination: entry.destination })
      await copyFile(entry.source, temporary, constants.COPYFILE_EXCL)
      if ((await deliveryFileSha256(temporary)) !== entry.sha256)
        throw new Error('Retained mirror file changed while staging acknowledgement.')
      const file = await open(temporary, 'r')
      try {
        await file.sync()
      } finally {
        await file.close()
      }
    }
    for (const entry of staged) {
      await rename(entry.temporary, entry.destination)
      const parent = await open(dirname(entry.destination), 'r')
      try {
        await parent.sync()
      } finally {
        await parent.close()
      }
    }
  } finally {
    for (const entry of staged) await rm(entry.temporary, { force: true })
  }
}

async function assertNoChildSymlink(root: string, file: string) {
  let path = root
  for (const part of file.split('/')) {
    path = join(path, part)
    try {
      if ((await lstat(path)).isSymbolicLink())
        throw new Error(`Acknowledged mirror paths cannot contain symlinks: ${file}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
}
