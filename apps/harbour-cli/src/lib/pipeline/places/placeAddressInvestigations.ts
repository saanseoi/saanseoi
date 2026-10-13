import {
  readReviewEvidence,
  registerReviewEvidence,
} from '../../storage/evidenceArchive.ts'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { StagedAddressResolution } from './supplementaryPlaceAddress'
import { validatePlaceAddressReviewReport } from './placeAddressReviewReferences.ts'

const directory = resolve(
  import.meta.dir,
  '../../../../../../fixtures/reviews/overture-place-address-investigations',
)

/** Deferral preserves identity uncertainty; it never approves a candidate link. */
export async function deferPlaceAddressReviews(input: {
  reviewPath: string
  authority?: string
  directory?: string
}) {
  const evidence = await readFile(input.reviewPath, 'utf8')
  const report = JSON.parse(evidence)
  validatePlaceAddressReviewReport(report)
  if (!report.unresolvedCount) return null
  const digest = createHash('sha256').update(evidence).digest('hex')
  const path = resolve(
    input.directory ?? directory,
    `${report.sourceRelease}-${digest}.json`,
  )
  const existing = await (input.directory
    ? readFile(path, 'utf8')
    : readReviewEvidence(path)
  )
    .then(value => (value === null ? null : JSON.parse(value)))
    .catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  if (existing) {
    if (
      existing.evidenceSha256 !== digest ||
      JSON.stringify(existing.report) !== JSON.stringify(report) ||
      existing.status !== 'needs-further-investigation' ||
      existing.priority !== 'low' ||
      existing.ingestionEffect !== 'retain-publisher-data-without-address-link' ||
      !existing.authority?.trim()
    )
      throw new Error('Place Address investigation evidence does not match.')
    if (!input.directory) await registerReviewEvidence(path)
    return path
  }
  if (!input.authority?.trim()) return null
  await mkdir(input.directory ?? directory, { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify({
      schemaVersion: 1,
      status: 'needs-further-investigation',
      priority: 'low',
      ingestionEffect: 'retain-publisher-data-without-address-link',
      authority: input.authority,
      evidenceSha256: digest,
      report,
    })}\n`,
    { flag: 'wx' },
  )
  if (!input.directory) await registerReviewEvidence(path)
  return path
}

export function deferredPlaceAddressResolution(
  row: StagedAddressResolution,
  evidenceId: string,
): StagedAddressResolution {
  if (row.tier !== 'review') return row
  if (row.addressId !== null)
    throw new Error('Unresolved Place Address cannot assert a link.')
  return {
    ...row,
    tier: 'investigation',
    investigation: {
      status: 'needs-further-investigation',
      priority: 'low',
      evidenceId,
    },
  }
}
