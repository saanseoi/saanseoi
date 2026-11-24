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
  test('applies safe lint fixes and formatting to staged content', () => {
    const root = fixture()
    write(root, 'safe.ts', 'let value=1\nconsole.log(value)\n')
    git(root, ['add', 'safe.ts'])
    checkStaged(root)
    const staged = Bun.spawnSync(['git', 'show', ':safe.ts'], { cwd: root })
    expect(staged.stdout.toString()).toBe('const value = 1;\nconsole.log(value);\n')
    expect(readFileSync(join(root, 'safe.ts'), 'utf8')).toBe(staged.stdout.toString())
  })

  test('sorts staged classes and updates an unchanged working file', () => {
    const root = fixture()
    write(root, 'view.tsx', 'export const view = <div className="p-4 flex" />;\n')
    git(root, ['add', 'view.tsx'])
    checkStaged(root)
    const content = readFileSync(join(root, 'view.tsx'), 'utf8')
    expect(content).toContain('className="flex p-4"')
    const staged = Bun.spawnSync(['git', 'show', ':view.tsx'], { cwd: root })
    expect(staged.stdout.toString()).toBe(content)
  })

  test('sorts the index without overwriting partially staged working changes', () => {
    const root = fixture()
    write(root, 'view.tsx', 'export const view = <div className="p-4 flex" />;\n')
    git(root, ['add', 'view.tsx'])
    const working = 'export const view = <div className="p-4 flex">Draft</div>\n'
    write(root, 'view.tsx', working)
    checkStaged(root)
    expect(readFileSync(join(root, 'view.tsx'), 'utf8')).toBe(working)
    const staged = Bun.spawnSync(['git', 'show', ':view.tsx'], { cwd: root })
    expect(staged.stdout.toString()).toContain('className="flex p-4"')
  })

  test('formats staged JSONC while preserving a different working copy', () => {
    const root = fixture()
    write(root, 'a space/config.jsonc', '{"value":2}')
    git(root, ['add', 'a space/config.jsonc'])
    write(root, 'a space/config.jsonc', '{ "value": 3 }\n')
    expect(() => checkStaged(root)).not.toThrow()
    const staged = Bun.spawnSync(['git', 'show', ':a space/config.jsonc'], {
      cwd: root,
    })
    expect(staged.stdout.toString()).toBe('{ "value": 2 }\n')
    expect(readFileSync(join(root, 'a space/config.jsonc'), 'utf8')).toBe(
      '{ "value": 3 }\n',
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
    write(root, 'broken.json', '{"value":')
    git(root, ['add', 'warnings.ts', 'broken.json'])
    let diagnostic = ''
    try {
      checkStaged(root)
    } catch (error) {
      diagnostic = String(error)
    }
    expect(diagnostic).toContain('broken.json')
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
    expect(() => checkStaged(root)).not.toThrow()
    const staged = Bun.spawnSync(['git', 'show', ':llms.txt'], { cwd: root })
    expect(staged.stdout.toString()).toBe('# Title\n\n- item\n')
    expect(readFileSync(join(root, 'llms.txt'), 'utf8')).toBe('# Title\n\n- item\n')
  })

  test('formats staged Markdown', () => {
    const root = fixture()
    write(root, 'notes.md', '#  Title\n\n- item\n')
    git(root, ['add', 'notes.md'])
    expect(() => checkStaged(root)).not.toThrow()
    expect(readFileSync(join(root, 'notes.md'), 'utf8')).toBe('# Title\n\n- item\n')
  })
})
