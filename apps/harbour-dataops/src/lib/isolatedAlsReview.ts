import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { prepareHkgovAlsRelease } from '../commands/hkgovAls.ts'

type Input = Parameters<typeof prepareHkgovAlsRelease>[0]
type Result = Awaited<ReturnType<typeof prepareHkgovAlsRelease>>
export type ReviewResult = Pick<
  Result,
  'identityRecords' | 'driftCandidates' | 'curationApplications' | 'divisionQuality'
>
const root = resolve(import.meta.dir, '../../../..')

// Stream large source files: fingerprinting must not allocate another GeoJSON copy.
export async function fingerprintTree(path: string): Promise<string> {
  const hash = createHash('sha256')
  async function visit(file: string) {
    const info = await stat(file).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    hash.update(file)
    if (!info) {
      hash.update('missing')
      return
    }
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await visit(join(file, name))
    } else {
      for await (const chunk of createReadStream(file)) hash.update(chunk)
    }
  }
  await visit(path)
  return hash.digest('hex')
}

// Database files may be large. Include WAL and inode/mtime/ctime/size so any local
// writer or reset invalidates reuse. Remote targets deliberately do not reuse.
async function databaseStamp(path: string): Promise<unknown> {
  const info = await stat(path, { bigint: true }).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!info) return null
  if (info.isDirectory())
    return Promise.all(
      (await readdir(path))
        .filter(name => !name.endsWith('-shm'))
        .sort()
        .map(async name => [name, await databaseStamp(join(path, name))]),
    )
  return [info.ino, info.size, info.mtimeNs, info.ctimeNs].map(String)
}

export async function isolatedAlsReview(input: Input): Promise<ReviewResult> {
  const dependencies = await Promise.all([
    ...[
      'apps/harbour-dataops/src',
      'apps/harbour-cli/src',
      'libs/core/src',
      'libs/db/src',
      'fixtures/meta/curations',
      'bun.lock',
    ].map(path => fingerprintTree(join(root, path))),
    fingerprintTree(input.sourceDir),
    databaseStamp(join(root, '.local/d1')),
    ...(typeof input.args.options.db === 'string'
      ? [
          databaseStamp(resolve(input.args.options.db)),
          databaseStamp(`${resolve(input.args.options.db)}-wal`),
        ]
      : []),
  ])
  const key = createHash('sha256')
    .update(JSON.stringify({ version: 1, runtime: Bun.version, input, dependencies }))
    .digest('hex')
  const directory = join(root, '.local/hkgov-dpo/preflight-cache')
  await mkdir(directory, { recursive: true })
  const checkpoint = join(directory, `${key}.json`)
  return cachedReviewChild(input, checkpoint, key)
}

export async function cachedReviewChild(
  input: Input,
  checkpoint: string,
  key: string,
  worker = join(import.meta.dir, 'isolatedAlsReviewWorker.ts'),
): Promise<ReviewResult> {
  if (!input.target.remote && (await Bun.file(checkpoint).exists())) {
    try {
      const cached = await Bun.file(checkpoint).json()
      if (
        cached.key === key &&
        cached.result?.identityRecords &&
        cached.result?.divisionQuality &&
        Array.isArray(cached.result?.driftCandidates) &&
        Array.isArray(cached.result?.curationApplications)
      ) {
        console.info(`Reusing cached ALS preflight ${input.sourceVersion}`)
        return cached.result
      }
    } catch {
      /* A damaged checkpoint is rebuilt by a fresh child. */
    }
  }
  const temporary = `${checkpoint}.${process.pid}.${crypto.randomUUID()}`
  const request = `${temporary}.request`
  try {
    await Bun.write(request, JSON.stringify(input))
    const child = Bun.spawn([process.execPath, worker, request, temporary], {
      cwd: process.cwd(),
      env: process.env,
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'ignore',
    })
    const code = await child.exited
    if (code !== 0)
      throw new Error(
        `ALS preflight ${input.sourceVersion} child exited with ${code}${child.signalCode ? ` (${child.signalCode})` : ''}; completed release checkpoints are retained.`,
      )
    const result: ReviewResult = await Bun.file(temporary).json()
    await Bun.write(temporary, JSON.stringify({ key, result }))
    await rename(temporary, checkpoint)
    return result
  } finally {
    await rm(request, { force: true })
    await rm(temporary, { force: true })
  }
}
