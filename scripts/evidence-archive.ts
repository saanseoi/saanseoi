import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { syncPushEvidence } from './evidence-push-cache.ts'
import {
  MANIFEST_PATH,
  hydrateEvidence,
  openEvidenceStore,
  parseEvidenceManifest,
  readManifest,
  refreshEvidenceManifest,
  syncEvidence,
  validateReviewCache,
  type EvidenceManifest,
} from '../apps/harbour-cli/src/lib/storage/evidenceArchive.ts'

async function git(...args: string[]) {
  const result = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
    result.exited,
  ])
  if (code) throw new Error(`git ${args[0]} failed: ${stderr.trim()}`)
  return stdout.trim()
}

export async function pushedManifests(records: string): Promise<EvidenceManifest[]> {
  const commits = new Set<string>()
  for (const line of records.trim().split('\n')) {
    if (!line.trim()) continue
    const fields = line.trim().split(/\s+/)
    if (
      fields.length !== 4 ||
      !/^[a-f0-9]{40,64}$/.test(fields[1]!) ||
      !/^[a-f0-9]{40,64}$/.test(fields[3]!)
    )
      throw new Error('Invalid Git pre-push record.')
    const oid = fields[1]!,
      base = fields[3]!
    if (/^0+$/.test(oid)) continue
    commits.add(oid)
    const knownBase =
      !/^0+$/.test(base) &&
      (await git('cat-file', '-e', `${base}^{commit}`).then(
        () => true,
        () => false,
      ))
    // Walk the whole history for new refs or unknown bases: even an ancestor's
    // catalogue must remain replayable after this push.
    const range = await git('rev-list', oid, ...(knownBase ? [`^${base}`] : []))
    for (const commit of range.split('\n').filter(Boolean)) commits.add(commit)
  }
  const manifests: EvidenceManifest[] = []
  const seen = new Set<string>()
  for (const commit of commits) {
    const tracked = await git(
      'ls-tree',
      '-r',
      '--name-only',
      commit,
      '--',
      'fixtures/reviews',
    )
    if (
      tracked.split('\n').some(path => path.endsWith('.json') && path !== MANIFEST_PATH)
    )
      throw new Error(
        `Review payloads are committed in ${commit}; retain them in the evidence archive instead.`,
      )
    if (!(await git('ls-tree', commit, '--', MANIFEST_PATH))) continue
    const content = await git('show', `${commit}:${MANIFEST_PATH}`)
    if (!seen.has(content)) {
      seen.add(content)
      manifests.push(parseEvidenceManifest(JSON.parse(content)))
    }
  }
  return manifests
}

async function main() {
  const root = await git('rev-parse', '--show-toplevel')
  process.chdir(root)
  const command = process.argv[2]
  if (command === 'refresh') {
    await refreshEvidenceManifest(root)
    console.log(
      'Evidence catalogue refreshed. Review and commit fixtures/reviews/manifest.json.',
    )
    return
  }
  const local = await readManifest(root)
  if (command === 'check') {
    await validateReviewCache(root, local)
    console.log(`Evidence cache validated (${local.entries.length} catalogue entries).`)
    return
  }
  if (!['sync', 'restore', 'push'].includes(command ?? ''))
    throw new Error(
      'Usage: evidence-archive.ts refresh|check|sync|restore|push <Git records file>',
    )
  const manifests = [local]
  let uncommitted = false
  if (command === 'push') {
    const records = await readFile(resolve(process.argv[3] ?? ''), 'utf8')
    if (
      !records.trim() ||
      records
        .trim()
        .split('\n')
        .every(line => /^0+$/.test(line.split(/\s+/)[1] ?? ''))
    )
      return
    manifests.push(...(await pushedManifests(records)))
    const head = await git('rev-parse', 'HEAD')
    if (records.split('\n').some(line => line.split(/\s+/)[1] === head)) {
      const committed = await git('show', `${head}:${MANIFEST_PATH}`).catch(() => '')
      uncommitted = committed !== JSON.stringify(local, null, 2).trim()
    }
  }
  if (command !== 'restore') await validateReviewCache(root, local)
  const buckets = new Map<string, EvidenceManifest>()
  for (const manifest of manifests) {
    const target = buckets.get(manifest.bucket) ?? { ...manifest, entries: [] }
    for (const entry of manifest.entries)
      if (
        !target.entries.some(item =>
          command === 'restore'
            ? item.path === entry.path
            : item.sha256 === entry.sha256,
        )
      )
        target.entries.push(entry)
    buckets.set(manifest.bucket, target)
  }
  for (const manifest of buckets.values()) {
    if (command === 'push') {
      await syncPushEvidence(root, manifest, {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      })
      console.log(
        `Evidence retained: ${manifest.entries.length} objects in ${manifest.bucket} (fresh or cached verification).`,
      )
      continue
    }
    const store = await openEvidenceStore(manifest.bucket)
    try {
      if (command === 'restore')
        for (const entry of manifest.entries) await hydrateEvidence(root, entry, store)
      else await syncEvidence(root, manifest, store)
    } finally {
      await store.dispose()
    }
    console.log(
      `Evidence ${command === 'restore' ? 'restored' : 'retained and verified'}: ${manifest.entries.length} objects in ${manifest.bucket}.`,
    )
  }
  if (uncommitted)
    throw new Error(
      'Evidence is archived, but the catalogue has uncommitted changes. Commit fixtures/reviews/manifest.json before pushing HEAD.',
    )
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
