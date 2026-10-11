import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'
import { startR2Process } from './remoteR2Process.ts'

export const REVIEW_ROOT = resolve(import.meta.dir, '../../../../../fixtures/reviews')
export const MANIFEST_PATH = 'fixtures/reviews/manifest.json'
export type EvidenceEntry = {
  path: string
  sha256: string
  size: number
  objectKey: string
  kind: string
  sourceVersion?: string
  originalPath?: string
  gitBlobOid?: string
}
export type EvidenceManifest = {
  schemaVersion: 1
  bucket: string
  entries: EvidenceEntry[]
}
export type EvidenceStore = {
  retain(entry: EvidenceEntry, path: string): Promise<void>
  download(entry: EvidenceEntry, path: string): Promise<void>
  dispose(): Promise<void>
}
export const evidenceId = (entry: EvidenceEntry) => `evidence:sha256:${entry.sha256}`
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export function parseEvidenceManifest(value: unknown): EvidenceManifest {
  const manifest = value as EvidenceManifest
  if (
    manifest?.schemaVersion !== 1 ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(manifest.bucket ?? '') ||
    !Array.isArray(manifest.entries)
  )
    throw new Error('Invalid evidence archive manifest.')
  const paths = new Set<string>()
  for (const entry of manifest.entries) {
    if (
      !entry ||
      typeof entry.path !== 'string' ||
      !/^fixtures\/reviews\/[a-zA-Z0-9_./-]+\.jsonl?$/.test(entry.path) ||
      entry.path.split('/').some(part => part === '..' || part === '.' || !part) ||
      entry.path === MANIFEST_PATH ||
      paths.has(entry.path) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.objectKey !== `evidence/sha256/${entry.sha256}` ||
      typeof entry.kind !== 'string' ||
      !entry.kind ||
      (entry.sourceVersion !== undefined && typeof entry.sourceVersion !== 'string') ||
      (entry.gitBlobOid !== undefined && !/^[a-f0-9]{40,64}$/.test(entry.gitBlobOid)) ||
      (entry.originalPath !== undefined &&
        (!/^[a-zA-Z0-9_./-]+$/.test(entry.originalPath) ||
          entry.originalPath
            .split('/')
            .some(part => part === '..' || part === '.' || !part)))
    )
      throw new Error('Invalid evidence archive entry.')
    paths.add(entry.path)
  }
  return manifest
}

export async function readManifest(root: string): Promise<EvidenceManifest> {
  return parseEvidenceManifest(
    JSON.parse(await readFile(resolve(root, MANIFEST_PATH), 'utf8')),
  )
}

async function safePath(root: string, path: string) {
  const target = resolve(root, path)
  // Refuse symlinks at every level, including directories, before reads or writes.
  let current = root
  for (const part of path.split('/')) {
    current = resolve(current, part)
    const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (stat?.isSymbolicLink()) throw new Error(`Evidence path is a symlink: ${path}`)
  }
  return target
}

export async function verifyEvidence(entry: EvidenceEntry, path: string) {
  const bytes = await readFile(path)
  if (bytes.length !== entry.size || hash(bytes) !== entry.sha256)
    throw new Error(`Evidence checksum mismatch: ${entry.path}`)
  return bytes
}

export async function listReviewFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function visit(path: string) {
    for (const entry of await readdir(resolve(root, path), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const child = `${path}/${entry.name}`
      if (entry.isSymbolicLink())
        throw new Error(`Evidence path is a symlink: ${child}`)
      if (entry.isDirectory()) await visit(child)
      else if (
        entry.isFile() &&
        /\.jsonl?$/.test(entry.name) &&
        child !== MANIFEST_PATH
      )
        files.push(child)
    }
  }
  await visit('fixtures/reviews')
  return files.sort()
}

async function describeEvidence(root: string, path: string): Promise<EvidenceEntry> {
  const bytes = await readFile(await safePath(root, path))
  const record = path.endsWith('.jsonl') ? {} : JSON.parse(bytes.toString('utf8'))
  const sha256 = hash(bytes)
  const snapshot = resolve(root, '.local/evidence-archive/sha256', sha256)
  await mkdir(dirname(snapshot), { recursive: true })
  try {
    await writeFile(snapshot, bytes, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  if (hash(await readFile(snapshot)) !== sha256)
    throw new Error('Evidence snapshot checksum mismatch.')
  const sourceVersion = record.sourceVersion ?? record.report?.sourceRelease
  return {
    path,
    sha256,
    size: bytes.length,
    objectKey: `evidence/sha256/${sha256}`,
    kind: path.split('/')[2] ?? 'review',
    ...(typeof sourceVersion === 'string' ? { sourceVersion } : {}),
  }
}

/** Serialise catalogue writes across processes; a held lock fails rather than losing evidence. */
async function updateManifest(
  root: string,
  update: (manifest: EvidenceManifest) => Promise<void>,
) {
  const path = resolve(root, MANIFEST_PATH)
  const lock = `${path}.lock`
  let acquired = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(lock)
      acquired = true
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  if (!acquired) throw new Error(`Evidence catalogue is locked: ${lock}`)
  const temporary = `${path}.${process.pid}.tmp`
  try {
    const manifest = await readManifest(root)
    await update(manifest)
    manifest.entries.sort((a, b) => a.path.localeCompare(b.path, 'en'))
    parseEvidenceManifest(manifest)
    await writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
    await rm(lock, { recursive: true, force: true })
  }
}

/** Explicit refresh is also how mutable generated indexes acquire a new archived version. */
export async function refreshEvidenceManifest(root: string) {
  await updateManifest(root, async manifest => {
    const entries = new Map(manifest.entries.map(entry => [entry.path, entry]))
    for (const path of await listReviewFiles(root))
      entries.set(path, {
        ...entries.get(path),
        ...(await describeEvidence(root, path)),
      })
    manifest.entries = [...entries.values()]
  })
}

export async function registerReviewEvidence(path: string) {
  const root = resolve(REVIEW_ROOT, '../..')
  const name = relative(root, path)
  if (!name.startsWith('fixtures/reviews/'))
    throw new Error('Evidence is outside the review cache.')
  const catalogued = (await readManifest(root)).entries.find(
    entry => entry.path === name,
  )
  if (catalogued) {
    await verifyEvidence(catalogued, await safePath(root, name))
    return
  }
  await updateManifest(root, async manifest => {
    const entry = await describeEvidence(root, name)
    const old = manifest.entries.find(item => item.path === name)
    if (old && old.sha256 !== entry.sha256)
      throw new Error(`Immutable review evidence changed: ${name}`)
    if (!old) manifest.entries.push(entry)
  })
}

export async function validateReviewCache(root: string, manifest: EvidenceManifest) {
  const entries = new Map(manifest.entries.map(entry => [entry.path, entry]))
  for (const path of await listReviewFiles(root)) {
    const entry = entries.get(path)
    if (!entry)
      throw new Error(
        `Uncatalogued evidence: ${path}. Run bun run evidence:refresh and commit the manifest.`,
      )
    await verifyEvidence(entry, await safePath(root, path))
  }
}

export async function openEvidenceStore(
  bucket: string,
  options: { persistPath?: string } = {},
): Promise<EvidenceStore> {
  const directory = await mkdtemp(resolve(tmpdir(), 'saanseoi-evidence-'))
  const configPath = resolve(directory, 'wrangler.json')
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'saanseoi-evidence-archive',
      compatibility_date: '2026-10-11',
      ...(accountId ? { account_id: accountId } : {}),
      r2_buckets: [
        { binding: 'R2_ASSETS', bucket_name: bucket, remote: !options.persistPath },
      ],
    }),
  )
  const client = startR2Process(configPath, {
    persistPath: options.persistPath,
    onProgress: message => process.stdout.write(`${message}\n`),
  })
  try {
    await client.ready
  } catch (error) {
    await client.dispose()
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  let sequence = 0
  return {
    async retain(entry, path) {
      const bytes = await verifyEvidence(entry, path)
      const sealed = resolve(directory, `${++sequence}.object`)
      await writeFile(sealed, bytes, { flag: 'wx' })
      try {
        await client.retain(entry.objectKey, sealed, {
          contentType: 'application/json',
        })
      } finally {
        await rm(sealed, { force: true })
      }
    },
    async download(entry, path) {
      await client.retain(
        entry.objectKey,
        path,
        { contentType: 'application/json' },
        { download: true },
      )
      await verifyEvidence(entry, path)
    },
    async dispose() {
      await client.dispose()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

/** Verify downloads before atomically making them available to ingestion. */
export async function hydrateEvidence(
  root: string,
  entry: EvidenceEntry,
  store: EvidenceStore,
) {
  const path = await safePath(root, entry.path)
  try {
    await verifyEvidence(entry, path)
    return path
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await mkdir(dirname(path), { recursive: true })
  const directory = await mkdtemp(resolve(dirname(path), '.evidence-'))
  const temporary = resolve(directory, 'download')
  try {
    await store.download(entry, temporary)
    await verifyEvidence(entry, temporary)
    // Do not overwrite a file created by a concurrent ingester.
    const { link } = await import('node:fs/promises')
    try {
      await link(temporary, path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    await verifyEvidence(entry, path)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  return path
}

export async function readReviewEvidence(path: string): Promise<string | null> {
  const root = resolve(REVIEW_ROOT, '../..')
  const name = relative(root, path)
  const manifest = await readManifest(root)
  const entry = manifest.entries.find(item => item.path === name)
  if (!entry) {
    // A new report has no acknowledgement yet. Do not create one during restoration.
    return readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  }
  const local = await safePath(root, entry.path)
  try {
    return (await verifyEvidence(entry, local)).toString('utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const store = await openEvidenceStore(manifest.bucket)
  try {
    return await readFile(await hydrateEvidence(root, entry, store), 'utf8')
  } finally {
    await store.dispose()
  }
}

export async function reviewEvidenceId(path: string) {
  const root = resolve(REVIEW_ROOT, '../..')
  const manifest = await readManifest(root)
  const entry = manifest.entries.find(item => item.path === relative(root, path))
  if (!entry) throw new Error(`Uncatalogued review evidence: ${path}`)
  await verifyEvidence(entry, await safePath(root, entry.path))
  return evidenceId(entry)
}

/** Sync exact committed catalogue versions, including objects absent from the cache. */
export async function syncEvidence(
  root: string,
  manifest: EvidenceManifest,
  store: EvidenceStore,
) {
  for (const entry of manifest.entries) {
    const path = await safePath(root, entry.path)
    let matches = false
    try {
      await verifyEvidence(entry, path)
      matches = true
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        !(
          error instanceof Error &&
          error.message.startsWith('Evidence checksum mismatch:')
        )
      )
        throw error
    }
    if (matches) await store.retain(entry, path)
    else {
      const snapshot = resolve(root, '.local/evidence-archive/sha256', entry.sha256)
      try {
        await verifyEvidence(entry, snapshot)
        await store.retain(entry, snapshot)
        continue
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }

      // Earlier commits may refer to an older version of a mutable index. Verify
      // those remote bytes without replacing the current local file.
      const directory = await mkdtemp(resolve(tmpdir(), 'saanseoi-evidence-verify-'))
      try {
        const temporary = resolve(directory, 'object')
        await store.download(entry, temporary)
        await verifyEvidence(entry, temporary)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
}
