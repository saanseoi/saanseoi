import { deferAlsPreparationReview } from './hkgovAlsDeferredInvestigations'
import { readFile } from 'node:fs/promises'
import { dirname, basename } from 'node:path'
import { fileSha256 } from '../../../pipeline/addresses/address3dImport'
import { writeDeliveryFile } from '../../../pipeline/local/sqlDeliveryFiles'

/** An interrupted review replaces stale readiness evidence and cannot authorise upload. */
export async function writeAlsReviewFailureCache(
  preparedFile: string,
  sourceVersion: string,
  issues: unknown[],
) {
  const path = `${preparedFile}.review.json`
  await writeDeliveryFile(
    dirname(path),
    basename(path),
    JSON.stringify(
      {
        schemaVersion: 1,
        sourceVersion,
        issues,
        preparationStatus: 'blocked',
      },
      null,
      2,
    ),
  )
}

/** Local preparation evidence. Resolve the underlying cases and prepare again. */
export async function writeAlsReviewCache(
  preparedFile: string,
  sourceVersion: string,
  issues: unknown[],
) {
  const path = `${preparedFile}.review.json`
  await writeDeliveryFile(
    dirname(path),
    basename(path),
    JSON.stringify(
      {
        schemaVersion: 1,
        sourceVersion,
        preparedSha256: await fileSha256(preparedFile),
        address3dSha256: await fileSha256(`${preparedFile}.address3d.jsonl`),
        issues,
      },
      null,
      2,
    ),
  )
  return fileSha256(path)
}

export async function assertPreparedAlsReview(
  preparedFile: string,
  sourceVersion: string,
  reviewSha256: unknown,
) {
  const path = `${preparedFile}.review.json`
  if (typeof reviewSha256 !== 'string' || !reviewSha256)
    throw new Error(
      'ALS preparation has no sealed review cache; prepare the release again.',
    )
  if ((await fileSha256(path)) !== reviewSha256)
    throw new Error(
      'ALS review cache changed after preparation; prepare the release again.',
    )
  const review = JSON.parse(await readFile(path, 'utf8'))
  if (
    review.schemaVersion !== 1 ||
    review.sourceVersion !== sourceVersion ||
    !Array.isArray(review.issues) ||
    review.preparedSha256 !== (await fileSha256(preparedFile)) ||
    review.address3dSha256 !== (await fileSha256(`${preparedFile}.address3d.jsonl`))
  )
    throw new Error(
      'ALS review cache does not match the prepared release; prepare it again.',
    )
  if (
    review.issues.length &&
    !(await deferAlsPreparationReview({
      sourceVersion,
      reviewSha256,
      issues: review.issues,
      authority: process.env.SAANSEOI_ALS_INVESTIGATION_AUTHORITY,
    }))
  )
    throw new Error(
      `Address assembly blocked by ${review.issues.length} unresolved ALS issues. Resolve the cases in ${path} and prepare the release again.`,
    )
}
