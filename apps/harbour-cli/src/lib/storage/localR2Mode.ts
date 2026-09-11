import { Database } from 'bun:sqlite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { LOCAL_D1_PERSIST_ROOT } from '../dbCache/localDbCacheConfig'
import { mapLocalTargetPaths, resolveD1Targets } from '../dbCache/localDbCacheTargets'
import type { UploadTarget } from '../cli/options'

export function checkLocalR2Mode(
  previous: string | undefined,
  next: string,
  hasArtefacts: boolean,
) {
  if (hasArtefacts && (previous ?? 'local') !== next)
    throw new Error(
      `Local ingestion already contains ${previous ?? 'local'} R2 references. Start a fresh local database set for --r2 ${next}, or complete an explicit artefact transfer first; continuation cannot retarget completed releases.`,
    )
}

/** Pin storage selection so completed phases cannot silently skip an R2 transfer. */
export async function pinLocalR2Mode(next: NonNullable<UploadTarget['r2']>) {
  const marker = join(LOCAL_D1_PERSIST_ROOT, 'r2-target.json')
  let previous: string | undefined
  try {
    previous = JSON.parse(await readFile(marker, 'utf8')).r2
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (previous !== undefined && !['local', 'preview', 'production'].includes(previous))
    throw new Error('Invalid local R2 target marker.')
  const paths = mapLocalTargetPaths(await resolveD1Targets('local'))
  const metaPath = paths.DB_META
  if (!metaPath) throw new Error('Missing local DB_META binding.')
  let hasArtefacts = false
  if (await Bun.file(metaPath).exists()) {
    const db = new Database(metaPath, { readonly: true, create: false })
    try {
      for (const table of ['assets', 'releaseProvenance']) {
        if (
          db
            .query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
            .get(table) &&
          db.query(`SELECT 1 FROM "${table}" LIMIT 1`).get()
        )
          hasArtefacts = true
      }
    } finally {
      db.close()
    }
  }
  checkLocalR2Mode(previous, next, hasArtefacts)
  if (previous !== next) {
    await mkdir(dirname(marker), { recursive: true })
    await writeFile(marker, `${JSON.stringify({ r2: next })}\n`)
  }
}
