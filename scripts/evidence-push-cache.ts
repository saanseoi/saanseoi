import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  openEvidenceStore,
  syncEvidence,
  type EvidenceEntry,
  type EvidenceManifest,
  type EvidenceStore,
} from '../apps/harbour-cli/src/lib/storage/evidenceArchive.ts'

export const PUSH_EVIDENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Push receipts are bounded historical verification, not proof of current existence.
 * Explicit evidence:sync bypasses them. Bump v1 when verification semantics change.
 */
export async function syncPushEvidence(
  root: string,
  manifest: EvidenceManifest,
  options: {
    accountId?: string
    now?: () => number
    openStore?: (bucket: string) => Promise<EvidenceStore>
  } = {},
) {
  const accountId = options.accountId?.trim()
  const now = options.now ?? Date.now
  const directory = resolve(root, '.local/evidence-archive/push-verification-v1')
  const receiptPath = (entry: EvidenceEntry) =>
    resolve(
      directory,
      `${createHash('sha256')
        .update(
          JSON.stringify([
            accountId,
            manifest.bucket,
            entry.objectKey,
            entry.sha256,
            entry.size,
          ]),
        )
        .digest('hex')}.json`,
    )
  const pending: EvidenceEntry[] = []
  for (const entry of manifest.entries) {
    let fresh = false
    if (accountId) {
      try {
        const receipt = JSON.parse(await readFile(receiptPath(entry), 'utf8'))
        const age = now() - receipt.verifiedAt
        fresh =
          Number.isSafeInteger(receipt.verifiedAt) &&
          age >= 0 &&
          age < PUSH_EVIDENCE_CACHE_TTL_MS
      } catch {
        // Missing or unreadable receipts require remote verification.
      }
    }
    if (!fresh) pending.push(entry)
  }
  const cached = manifest.entries.length - pending.length
  if (cached)
    console.log(
      `Evidence verification cached: ${cached} objects (less than 24 hours old).`,
    )
  if (!pending.length) return
  const store = await (options.openStore ?? openEvidenceStore)(manifest.bucket)
  try {
    await syncEvidence(root, { ...manifest, entries: pending }, store, {
      async onVerified(entry) {
        if (!accountId) return
        await mkdir(directory, { recursive: true })
        const path = receiptPath(entry)
        const temporary = `${path}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify({ verifiedAt: now() }), {
            flag: 'wx',
          })
          await rename(temporary, path)
        } finally {
          await rm(temporary, { force: true })
        }
      },
    })
  } finally {
    await store.dispose()
  }
}
