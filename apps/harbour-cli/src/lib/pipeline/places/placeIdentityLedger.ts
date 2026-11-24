import { createHash } from 'node:crypto'
import { link, mkdir, readFile, open, unlink } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import type { PlaceIdentityDecision } from '@repo/core/pipeline/services/places/placeIdentity'

/** Immutable, reviewable evidence; a retry must never overwrite an earlier decision. */
export async function writePlaceIdentityLedger(input: {
  scope: string
  sourceVersion: string
  decisions: PlaceIdentityDecision[]
  stagingRoot: string
  predecessorSnapshotId?: string | null
}) {
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  const entries = [...input.decisions].sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId),
  )
  const policyHash = digest(
    await readFile(
      new URL(
        '../../../../../../fixtures/meta/processing-rules/assembly/place-identity.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  const implementationHash = digest(
    await readFile(
      new URL(
        '../../../../../../libs/core/src/pipeline/services/places/placeIdentity.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  const directory = resolve(input.stagingRoot, digest(input.scope).slice(0, 16))
  await mkdir(directory, { recursive: true })
  const temporary = resolve(directory, `.${crypto.randomUUID()}.tmp`)
  const output = await open(temporary, 'wx')
  const checksum = createHash('sha256')
  const append = async (text: string) => {
    checksum.update(text)
    await output.writeFile(text)
  }
  let hash: string
  let path: string
  try {
    try {
      await append(
        `${JSON.stringify({ schemaVersion: 1, policyHash, implementationHash, basis: 'automatic', scope: input.scope, predecessorSnapshotId: input.predecessorSnapshotId ?? null, sourceRelease: input.sourceVersion, records: entries.length })}\n`,
      )
      for (const [index, row] of entries.entries()) {
        if (index % 1_000 === 0) Bun.gc(true)
        await append(`${JSON.stringify(row)}\n`)
      }
      // Preserve the original empty-ledger byte format too.
      if (!entries.length) await append('\n')
      await output.sync()
    } finally {
      await output.close()
    }
    hash = checksum.digest('hex')
    path = resolve(directory, `${hash}.jsonl`)
    try {
      await link(temporary, path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const existing = createHash('sha256')
      for await (const bytes of createReadStream(path)) existing.update(bytes)
      if (existing.digest('hex') !== hash)
        throw new Error(
          `Place identity curation evidence differs from its hash: ${path}`,
        )
    }
  } finally {
    await unlink(temporary)
  }
  return {
    path,
    hash,
    records: entries.length,
    sourceRelease: input.sourceVersion,
    predecessorSnapshotId: input.predecessorSnapshotId ?? null,
    policyHash,
    implementationHash,
    storage: 'r2-audit-partitions' as const,
  }
}
