/** Generate the island review cache from the exact retained publisher archives. */
import { loadDivisionReviewInputs } from '../apps/harbour-cli/src/lib/pipeline/curatedDivisions/reviewInputs'
import { resolve, dirname } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
const root = resolve(import.meta.dir, '..')
const output = resolve(
  process.argv.find(value => value.startsWith('--out='))?.slice(6) ??
    '.local/division-review/islands.json',
)
const inputs = await loadDivisionReviewInputs({
  root,
  apiBaseUrl: process.env.SAANSEOI_REVIEW_API_URL,
  archiveBaseUrl: process.env.SAANSEOI_REVIEW_ARCHIVE_URL,
})
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(inputs.islands, null, 2) + '\n')
console.log(output)
