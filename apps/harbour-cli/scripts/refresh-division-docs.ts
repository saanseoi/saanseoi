import { readFile, writeFile } from 'node:fs/promises'
import { divisionDocumentationValues } from '../src/lib/commands/docsDivisionCounts'
import {
  parseMarkdownFixture,
  serialiseMarkdownFixture,
} from '../src/lib/commands/docsRendering'

const [fixturePath, divisionPath, areaPath, mode] = process.argv.slice(2)
if (!fixturePath || !divisionPath || !areaPath || (mode && mode !== '--check'))
  throw new Error(
    'Usage: bun apps/harbour-cli/scripts/refresh-division-docs.ts FIXTURE DIVISION.zip AREA.zip [--check]',
  )
const fixture = parseMarkdownFixture(await readFile(fixturePath, 'utf8'))
const values = await divisionDocumentationValues(
  fixture.frontmatter.release!,
  divisionPath,
  areaPath,
)
if (mode === '--check') {
  const stale = Object.keys(values).filter(
    key => fixture.frontmatter[key] !== values[key],
  )
  if (stale.length)
    throw new Error(`Stale release documentation values: ${stale.join(', ')}`)
  console.log(`Verified ${fixture.frontmatter.release}`)
} else {
  await writeFile(
    fixturePath,
    serialiseMarkdownFixture({ ...fixture.frontmatter, ...values }, fixture.body),
  )
  console.log(`Refreshed ${fixture.frontmatter.release}`)
}
