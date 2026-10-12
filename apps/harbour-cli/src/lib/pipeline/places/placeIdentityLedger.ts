import { createHash } from 'node:crypto'
import { link, mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
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
  const text = `${JSON.stringify({ schemaVersion: 1, policyHash, implementationHash, basis: 'automatic', scope: input.scope, predecessorSnapshotId: input.predecessorSnapshotId ?? null, sourceRelease: input.sourceVersion, records: entries.length })}\n${entries.map(row => JSON.stringify(row)).join('\n')}\n`
  const hash = digest(text)
  const directory = resolve(input.stagingRoot, digest(input.scope).slice(0, 16))
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, `${hash}.jsonl`)
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, text, { flag: 'wx' })
  try {
    await link(temporary, path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if ((await readFile(path, 'utf8')) !== text)
      throw new Error(`Place identity curation evidence differs from its hash: ${path}`)
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
