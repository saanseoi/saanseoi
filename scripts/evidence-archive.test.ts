import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pushedManifests } from './evidence-archive.ts'

test('push checks exact non-HEAD refs, intermediate catalogues, multiple refs and deletion-only pushes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'evidence-push-'))
  const previous = process.cwd()
  const zero = '0'.repeat(40)
  async function git(...args: string[]) {
    const result = Bun.spawn(['git', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(result.stdout).text()
    if (await result.exited) throw new Error(await new Response(result.stderr).text())
    return output.trim()
  }
  try {
    await git('init', '-q')
    await git('config', 'commit.gpgsign', 'false')
    await git('config', 'user.name', 'Evidence test')
    await git('config', 'user.email', 'evidence@example.invalid')
    await mkdir(resolve(root, 'fixtures/reviews'), { recursive: true })
    await writeFile(
      resolve(root, 'fixtures/reviews/manifest.json'),
      JSON.stringify({ schemaVersion: 1, bucket: 'ss-evidence', entries: [] }),
    )
    await git('add', '.')
    await git('commit', '-qm', 'first catalogue')
    const first = await git('rev-parse', 'HEAD')
    await writeFile(
      resolve(root, 'fixtures/reviews/manifest.json'),
      JSON.stringify({ schemaVersion: 1, bucket: 'ss-evidence-other', entries: [] }),
    )
    await git('commit', '-qam', 'second catalogue')
    const second = await git('rev-parse', 'HEAD')
    await git('rm', 'fixtures/reviews/manifest.json')
    await git('commit', '-qm', 'removed catalogue')
    const third = await git('rev-parse', 'HEAD')
    process.chdir(root)
    expect(
      (
        await pushedManifests(
          `refs/heads/other ${second} refs/heads/other ${zero}\nrefs/heads/main ${third} refs/heads/main ${first}`,
        )
      )
        .map(m => m.bucket)
        .sort(),
    ).toEqual(['ss-evidence', 'ss-evidence-other'])
    expect(
      await pushedManifests(`refs/heads/main ${zero} refs/heads/main ${third}`),
    ).toEqual([])
    expect(
      await pushedManifests(`refs/heads/main ${third} refs/heads/main ${second}`),
    ).toEqual([])
    await expect(pushedManifests('invalid')).rejects.toThrow('Invalid Git')
  } finally {
    process.chdir(previous)
    await rm(root, { recursive: true, force: true })
  }
})
