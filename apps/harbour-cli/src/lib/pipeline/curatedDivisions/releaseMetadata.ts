import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMarkdownFixture } from '../../commands/docsRendering'
import { readLatestLocalSourceVersion } from '../../sources/sourceUpdatesVersions'

export async function readCuratedDivisionRelease(root: string) {
  const editions = await Promise.all(
    ['division', 'division-area'].map(async resource => {
      const dataset = `ds-hk-saanseoi-${resource}`
      const version = await readLatestLocalSourceVersion(dataset)
      if (!version) throw Error(`Missing release metadata for ${dataset}`)
      const code = `dr-hk-saanseoi-${resource}-${version}`
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
    }),
  )
  const [division, area] = editions
  if (!division || !area || JSON.stringify(division) !== JSON.stringify(area))
    throw Error('Curated Division and DivisionArea release editions differ.')
  return division
}
