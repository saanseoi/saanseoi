import { expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const checker = await readFile(
  new URL('../.husky/check-tailwind.sh', import.meta.url),
  'utf8',
)
const zero = '0'.repeat(40)

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), 'tailwind-hook-test-'))
  const root = resolve(directory, 'repo'),
    bin = resolve(directory, 'bin')
  const log = resolve(directory, 'operations')
  const upgrade = resolve(directory, 'upgrade')
  await mkdir(root)
  await mkdir(bin)
  async function git(...args: string[]) {
    const process = Bun.spawn(['git', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(process.stdout).text()
    if (await process.exited) throw new Error(await new Response(process.stderr).text())
    return output.trim()
  }
  await git('init', '-q')
  await git('config', 'user.name', 'Hook test')
  await git('config', 'user.email', 'hook@example.invalid')
  await git('config', 'commit.gpgsign', 'false')
  await mkdir(resolve(root, '.husky'))
  await writeFile(resolve(root, '.husky/check-tailwind.sh'), checker)
  await writeFile(resolve(root, '.gitignore'), 'node_modules/\n')
  await writeFile(resolve(root, 'package.json'), '{}\n')
  await writeFile(resolve(root, 'bun.lock'), '{}\n')
  for (const app of ['atlas-app', 'basemap-viewer']) {
    await mkdir(resolve(root, 'apps', app), { recursive: true })
    await writeFile(resolve(root, 'apps', app, 'package.json'), '{}\n')
    await writeFile(
      resolve(root, 'apps', app, 'view.svelte'),
      '<p class="wrap-break-word">text</p>\n',
    )
  }
  await writeFile(
    upgrade,
    `#!/bin/sh
set -eu
[ "$PWD" != "$(git rev-parse --show-toplevel)" ]
[ "$#" -eq 1 ] && [ "$1" = --force ]
printf 'scan %s\n' "$(basename "$PWD")" >> "$TAILWIND_TEST_LOG"
[ "\${TAILWIND_TEST_FAIL:-0}" = 0 ] || exit 1
bun add tailwindcss@latest
printf '{"incidental":true}\n' > package.json
sed -i 's/break-words/wrap-break-word/g' view.svelte
`,
  )
  await chmod(upgrade, 0o755)
  await writeFile(
    resolve(bin, 'bun'),
    `#!/bin/sh
set -eu
case "$1" in
  --version) echo '1.4.2' ;;
  install)
    [ "$2" = --frozen-lockfile ] && [ "$3" = --ignore-scripts ]
    printf 'install\n' >> "$TAILWIND_TEST_LOG"
    mkdir -p node_modules/.bin
    cp "$TAILWIND_TEST_UPGRADE" node_modules/.bin/upgrade
    ;;
  *) echo 'Unexpected package mutation' >&2; exit 1 ;;
esac
`,
  )
  await chmod(resolve(bin, 'bun'), 0o755)
  await git('add', '.')
  await git('commit', '-qm', 'fixture')
  // This marker must never run when the hook creates a disposable worktree.
  await writeFile(
    resolve(root, '.git/hooks/post-checkout'),
    `#!/bin/sh\necho unsafe >> '${log}'\n`,
  )
  await chmod(resolve(root, '.git/hooks/post-checkout'), 0o755)
  async function run(base = zero, oid?: string, fail = false) {
    const head = oid ?? (await git('rev-parse', 'HEAD'))
    const process = Bun.spawn(['sh', '.husky/check-tailwind.sh'], {
      cwd: root,
      env: {
        ...Bun.env,
        PATH: `${bin}:${Bun.env.PATH}`,
        TAILWIND_TEST_LOG: log,
        TAILWIND_TEST_UPGRADE: upgrade,
        TAILWIND_TEST_FAIL: fail ? '1' : '0',
      },
      stdin: new Blob([`refs/heads/test ${head} refs/heads/test ${base}\n`]),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [out, err, code] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])
    return { output: out + err, code }
  }
  const installs = async () =>
    (await readFile(log, 'utf8').catch(() => ''))
      .split('\n')
      .filter(line => line === 'install').length
  return {
    root,
    git,
    run,
    installs,
    log,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  }
}

test('Tailwind checks each workspace with frozen dependencies and caches only clean immutable inputs', async () => {
  const f = await fixture()
  try {
    expect((await f.run()).code).toBe(0)
    const operations = await readFile(f.log, 'utf8')
    expect(operations).toContain('scan atlas-app')
    expect(operations).toContain('scan basemap-viewer')
    expect(operations).not.toContain('unsafe')
    expect(await f.git('status', '--porcelain')).toBe('')
    expect((await f.run()).output).toContain('cached')
    expect(await f.installs()).toBe(1)
    await writeFile(
      resolve(f.root, '.husky/check-tailwind.sh'),
      `${checker}\n# revised checker\n`,
    )
    expect((await f.run()).code).toBe(0)
    expect(await f.installs()).toBe(2)
  } finally {
    await f.cleanup()
  }
})

test('basemap-only changes trigger migration, import only canonical edits, and do not cache dirty results', async () => {
  const f = await fixture()
  try {
    const base = await f.git('rev-parse', 'HEAD')
    await writeFile(
      resolve(f.root, 'apps/basemap-viewer/view.svelte'),
      '<p class="break-words">text</p>\n',
    )
    await f.git('commit', '-qam', 'basemap class')
    expect((await f.run(base)).code).toBe(1)
    expect(
      await readFile(resolve(f.root, 'apps/basemap-viewer/view.svelte'), 'utf8'),
    ).toContain('wrap-break-word')
    expect(await f.git('diff', '--name-only')).toBe('apps/basemap-viewer/view.svelte')
    expect((await f.run(base)).output).toContain('has local changes')
    expect(await f.installs()).toBe(2)
    await f.git('commit', '-qam', 'canonical class')
    expect((await f.run()).code).toBe(0)
    expect((await f.run()).output).toContain('cached')
  } finally {
    await f.cleanup()
  }
})

test('Tailwind preserves staged and non-HEAD work, and failed migration results are retried', async () => {
  const f = await fixture()
  try {
    expect((await f.run(zero, undefined, true)).code).toBe(1)
    expect((await f.run(zero, undefined, true)).code).toBe(1)
    expect(await f.installs()).toBe(2)
    const path = resolve(f.root, 'apps/atlas-app/view.svelte')
    await writeFile(path, '<p class="break-words">committed</p>\n')
    await f.git('commit', '-qam', 'noncanonical class')
    const old = await f.git('rev-parse', 'HEAD')
    await writeFile(resolve(f.root, 'other.txt'), 'next commit\n')
    await f.git('add', 'other.txt')
    await f.git('commit', '-qm', 'advance HEAD')
    expect((await f.run(zero, old)).output).toContain('not the checked-out HEAD')
    expect(await readFile(path, 'utf8')).toContain('break-words')
    await writeFile(path, '<p class="break-words">staged</p>\n')
    await f.git('add', 'apps/atlas-app/view.svelte')
    const staged = await f.git('diff', '--cached')
    expect((await f.run()).output).toContain('has local changes')
    expect(await f.git('diff', '--cached')).toBe(staged)
    expect(await f.git('diff')).toBe('')
  } finally {
    await f.cleanup()
  }
})

test('backend-only changes and deletion-only pushes avoid Tailwind installation', async () => {
  const f = await fixture()
  try {
    const base = await f.git('rev-parse', 'HEAD')
    await writeFile(resolve(f.root, 'backend.ts'), 'export const ok = true\n')
    await f.git('add', 'backend.ts')
    await f.git('commit', '-qm', 'backend')
    expect((await f.run(base)).output).toContain('skipping')
    expect((await f.run(base, zero)).code).toBe(0)
    expect(await f.installs()).toBe(0)
  } finally {
    await f.cleanup()
  }
})
