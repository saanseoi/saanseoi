import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseHkgovAlsIdentityDecisions } from '../apps/harbour-cli/src/lib/sources/hkgov/dpo/hkgovAlsDrift'
import {
  mergeIdentityDecisions,
  validateIdentityReviewExport,
} from './lib/als-identity-review'
import {
  readIdentityReview,
  verifyIdentityReviewFiles,
} from './lib/als-identity-review-files'

const root = resolve(import.meta.dir, '..')
const [exportPath, ...flags] = process.argv.slice(2)
if (!exportPath || flags.some(flag => flag !== '--write'))
  throw new Error(
    'Usage: bun scripts/als-identity-review.ts <review-export.json> [--write]',
  )
const exported = JSON.parse(await readFile(resolve(exportPath), 'utf8'))
const input = await readIdentityReview(root, exported.sourceVersion)
const checked = validateIdentityReviewExport(exported, input.review)
await verifyIdentityReviewFiles(input)
const fixturePath = resolve(root, 'fixtures/meta/curations/hkgov-dpo-address.json')
const before = await readFile(fixturePath, 'utf8')
const fixture = parseHkgovAlsIdentityDecisions(JSON.parse(before))
const merged = mergeIdentityDecisions(fixture, checked, input.review)
const directory = resolve(root, '.local/hkgov-dpo/identity-review')
await mkdir(directory, { recursive: true })
const prefix = `${checked.sourceVersion}-${checked.reviewSha256}`
const proposal = resolve(directory, `${prefix}.proposed.json`)
await writeFile(proposal, `${JSON.stringify(merged, null, 2)}\n`)
const receipt = {
  ...checked,
  preparedSha256: input.review.preparedSha256,
  address3dSha256: input.review.address3dSha256,
  previousFixtureSha256: createHash('sha256').update(before).digest('hex'),
  addedDecisionCount: merged.decisions.length - fixture.decisions.length,
  unresolvedCaseCount: input.review.cases.filter(
    item =>
      !merged.decisions.some(
        decision =>
          decision.previousIdentityKey === item.previous.identityKey &&
          decision.currentIdentityKey === item.current.identityKey,
      ),
  ).length,
}
await writeFile(
  resolve(directory, `${prefix}.review.json`),
  `${JSON.stringify(receipt, null, 2)}\n`,
)
if (flags.includes('--write')) {
  // Recheck after hashing large artefacts; never overwrite a concurrent fixture edit.
  const latest = await readIdentityReview(root, checked.sourceVersion)
  if (
    latest.review.reviewSha256 !== checked.reviewSha256 ||
    (await readFile(fixturePath, 'utf8')) !== before
  )
    throw new Error(
      'Review evidence or identity fixture changed while applying decisions.',
    )
  const temporary = `${fixturePath}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`)
  await rename(temporary, fixturePath)
  console.log(
    `Applied ${receipt.addedDecisionCount} reviewed identity decisions; ${receipt.unresolvedCaseCount} cases remain unresolved. Prepare the release again before continuing ingestion.`,
  )
} else {
  console.log(
    `Validated ${checked.decisions.length} decisions. Proposed fixture: ${proposal}`,
  )
  console.log(
    'The active identity fixture is unchanged. Add --write to apply the reviewed export.',
  )
}
