import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMarkdownFixture } from '../../commands/docsRendering'
import { readLatestLocalSourceVersion } from '../../sources/sourceUpdatesVersions'

export async function readCuratedDivisionRelease(
  root: string,
  selectedVersion?: string,
) {
  if (selectedVersion && !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(selectedVersion))
    throw Error(`Invalid curated release edition: ${selectedVersion}`)

  const dataset = 'ds-hk-saanseoi-division'
  const version = selectedVersion ?? (await readLatestLocalSourceVersion(dataset))
  if (!version) throw Error(`Missing release metadata for ${dataset}`)
  const code = `dr-hk-saanseoi-division-${version}`
  const { frontmatter } = parseMarkdownFixture(
    await readFile(
      resolve(root, 'fixtures/meta/releases', dataset, `${code}.md`),
      'utf8',
    ),
  )
  if (
    frontmatter.dataset !== dataset ||
    frontmatter.release !== code ||
    frontmatter.releaseVersion !== version ||
    frontmatter.cohortKey !== version ||
    !frontmatter.sourceSchemaVersion
  )
    throw Error(`Invalid curated release metadata: ${code}`)
  return {
    releaseVersion: version,
    publicationDate: frontmatter.publicationDate ?? version.slice(0, 10),
    sourceSchemaVersion: frontmatter.sourceSchemaVersion,
  }
}
