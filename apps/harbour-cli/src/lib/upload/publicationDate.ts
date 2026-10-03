import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { releasePublicationDate } from '@repo/core/db/metaRegistry'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

/** Only the release fixture's frontmatter can supply an upstream publication day. */
export async function readFixturePublicationDate(
  plan: { datasetCode: string; releaseCode: string; sourceVersion: string },
  root = REPO_ROOT,
): Promise<string | undefined> {
  const path = resolve(
    root,
    'fixtures/meta/releases',
    plan.datasetCode,
    `${plan.releaseCode.split('::')[0]}.md`,
  )
  const content = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  const frontmatter = content?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  const match = frontmatter?.match(
    /^publicationDate:\s*(?:"([^"]*)"|'([^']*)'|([^\r\n]*))$/m,
  )
  if (!match) return undefined
  const date = (match[1] ?? match[2] ?? match[3] ?? '').trim()
  return releasePublicationDate(plan.sourceVersion, date) ?? undefined
}
