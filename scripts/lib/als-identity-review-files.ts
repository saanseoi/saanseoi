import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertSourceVersion, buildIdentityReview } from './als-identity-review.ts'

export async function readIdentityReview(root: string, sourceVersion: string) {
  assertSourceVersion(sourceVersion)
  const prepared = resolve(
    root,
    '.local/hkgov-dpo/prepared',
    `hkgov-hk-${sourceVersion}-address.parquet`,
  )
  const bytes = await readFile(`${prepared}.review.json`)
  const review = buildIdentityReview(
    JSON.parse(bytes.toString()),
    createHash('sha256').update(bytes).digest('hex'),
  )
  if (review.sourceVersion !== sourceVersion)
    throw new Error('Review source version does not match its file.')
  return { prepared, review }
}

async function fileDigest(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyIdentityReviewFiles(
  input: Awaited<ReturnType<typeof readIdentityReview>>,
) {
  const [prepared, address3d] = await Promise.all([
    fileDigest(input.prepared),
    fileDigest(`${input.prepared}.address3d.jsonl`),
  ])
  if (
    prepared !== input.review.preparedSha256 ||
    address3d !== input.review.address3dSha256
  )
    throw new Error(
      'Prepared source files changed; prepare and review the release again.',
    )
}
