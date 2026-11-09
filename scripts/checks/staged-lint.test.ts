// BUN
import { afterEach, describe, expect, test } from 'bun:test'

// NODE
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// LOCAL
import { checkStaged } from './staged-lint'

const repositories: string[] = []

/** Create an isolated Git fixture with a committed lint policy. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'hype-hook-test-'))
  repositories.push(root)
  git(root, ['init', '-q'])
  write(root, 'biome.json', '{"formatter":{"indentStyle":"space"}}\n')
  write(root, 'package.json', '{}\n')
  write(root, 'existing.json', '{ "value": 1 }\n')
  git(root, ['add', '.'])
  git(root, [
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.test',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-qm',
    'fixture',
  ])
  return root
}

/** Execute fixture-only Git operations and fail on errors. */
function git(root: string, args: string[]): void {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
  const result = Bun.spawnSync(['git', ...args], { cwd: root, env })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
}

/** Write a fixture file, including paths containing spaces. */
function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

afterEach(() => {
  for (const root of repositories.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('staged lint snapshot', () => {
  test('rejects unformatted staged JSONC even when the working copy is fixed', () => {
    const root = fixture()
    write(root, 'a space/config.jsonc', '{"value":2}')
    git(root, ['add', 'a space/config.jsonc'])
    write(root, 'a space/config.jsonc', '{ "value": 2 }\n')
    const index = readFileSync(join(root, '.git/index'))
    expect(() => checkStaged(root)).toThrow()
    expect(readFileSync(join(root, '.git/index'))).toEqual(index)
    expect(readFileSync(join(root, 'a space/config.jsonc'), 'utf8')).toBe(
      '{ "value": 2 }\n',
    )
  })

  test('accepts clean staged content without touching dirty working content', () => {
    const root = fixture()
    write(root, 'a space/config.jsonc', '{ "value": 2 }\n')
    git(root, ['add', 'a space/config.jsonc'])
    write(root, 'a space/config.jsonc', '{"value":3}')
    expect(() => checkStaged(root)).not.toThrow()
    expect(readFileSync(join(root, 'a space/config.jsonc'), 'utf8')).toBe('{"value":3}')
  })

  test('shows blocking errors without burying them beneath advisory warnings', () => {
    const root = fixture()
    write(
      root,
      'warnings.ts',
      'const value: string | null = null\nconsole.log(value!)\n',
    )
    write(root, 'broken.json', '{"value":2}')
    git(root, ['add', 'warnings.ts', 'broken.json'])
    let diagnostic = ''
    try {
      checkStaged(root)
    } catch (error) {
      diagnostic = String(error)
    }
    expect(diagnostic).toContain('broken.json')
    expect(diagnostic).toContain('format')
    expect(diagnostic).not.toContain('noNonNullAssertion')
  })

  test('checks HTML instead of silently omitting its extension', () => {
    const root = fixture()
    write(root, 'example.html', '<img src="example.png">')
    git(root, ['add', 'example.html'])
    expect(() => checkStaged(root)).toThrow()
  })

  test('checks existing files when the lint policy changes', () => {
    const root = fixture()
    write(root, 'existing.md', '#  Existing\n')
    git(root, ['add', 'existing.md'])
    git(root, [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.test',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'old backlog',
    ])
    write(
      root,
      'biome.json',
      '{ "formatter": { "indentStyle": "space", "lineWidth": 88 } }\n',
    )
    git(root, ['add', 'biome.json'])
    expect(() => checkStaged(root)).toThrow('existing.md')
  })

  test('rejects deleting the lint policy instead of silently using defaults', () => {
    const root = fixture()
    git(root, ['rm', 'biome.json'])
    expect(() => checkStaged(root)).toThrow('retain its Biome configuration')
  })

  test('rejects checking a new staged formatter version with the old installation', () => {
    const root = fixture()
    write(
      root,
      'package.json',
      '{ "devDependencies": { "@biomejs/biome": "0.0.0" } }\n',
    )
    git(root, ['add', 'package.json'])
    expect(() => checkStaged(root)).toThrow('differs from installed')
  })

  test('checks staged llms.txt as Markdown instead of skipping an unknown extension', () => {
    const root = fixture()
    write(root, 'llms.txt', '#  Title\n\n- item\n')
    git(root, ['add', 'llms.txt'])
    write(root, 'llms.txt', '# Title\n\n- item\n')
    expect(() => checkStaged(root)).toThrow('llms.txt: Markdown formatting differs')
    expect(readFileSync(join(root, 'llms.txt'), 'utf8')).toBe('# Title\n\n- item\n')
  })

  test('checks Markdown without rewriting it', () => {
    const root = fixture()
    write(root, 'notes.md', '#  Title\n\n- item\n')
    git(root, ['add', 'notes.md'])
    expect(() => checkStaged(root)).toThrow()
    expect(readFileSync(join(root, 'notes.md'), 'utf8')).toBe('#  Title\n\n- item\n')
  })
})
