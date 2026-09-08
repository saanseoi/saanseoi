import { prepareHkgovAlsRelease } from '../commands/hkgovAls.ts'
import { resolve } from 'node:path'
import { AlsCurationReviewError } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovAlsReviewIssue'
import { queueAlsCurationReview } from './alsCurationReviewQueue'

const [request, output] = process.argv.slice(2)
if (!request || !output)
  throw new Error('ALS review worker requires request and output paths')
const input = await Bun.file(request).json()
try {
  const result = await prepareHkgovAlsRelease({ ...input, writeOutput: false })
  await Bun.write(
    output,
    JSON.stringify({
      identityRecords: result.identityRecords,
      driftCandidates: result.driftCandidates,
      curationApplications: result.curationApplications,
      divisionQuality: result.divisionQuality,
    }),
  )
} catch (error) {
  if (!(error instanceof AlsCurationReviewError)) throw error
  const path = await queueAlsCurationReview(
    error,
    resolve(import.meta.dir, '../../../../.local/hkgov-dpo/review-queue'),
  )
  const message = `${error.message}\nReview JSON: ${path}`
  await Bun.write(`${output}.failure.json`, JSON.stringify({ message }))
  process.exitCode = 1
}
