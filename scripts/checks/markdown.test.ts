// BUN
import { afterEach, expect, test } from 'bun:test'
// NODE
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
// LOCAL
import { formatMarkdown } from './markdown'

const root = resolve(import.meta.dir, '../..')
const directories: string[] = []

/** Create a temporary formatter fixture using the repository's actual policy. */
function fixture(file: string, content: string): string {
  const cwd = mkdtempSync(join(tmpdir(), 'hype-markdown-test-'))
  directories.push(cwd)
  const config = JSON.parse(readFileSync(join(root, 'biome.json'), 'utf8'))
  config.vcs.enabled = false
  writeFileSync(join(cwd, 'biome.json'), JSON.stringify(config))
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), content)
  return cwd
}

afterEach(() => {
  for (const cwd of directories.splice(0)) rmSync(cwd, { recursive: true, force: true })
})

test('llms.txt checks are read-only and explicit formatting is stable', () => {
  const file = 'a space/llms.txt'
  const input = '#  Title\n\n- item\n'
  const cwd = fixture(file, input)
  expect(() => formatMarkdown([file], cwd)).toThrow('Markdown formatting differs')
  expect(readFileSync(join(cwd, file), 'utf8')).toBe(input)
  formatMarkdown([file], cwd, true)
  const formatted = readFileSync(join(cwd, file), 'utf8')
  expect(formatted).toBe('# Title\n\n- item\n')
  expect(() => formatMarkdown([file], cwd)).not.toThrow()
  formatMarkdown([file], cwd, true)
  expect(readFileSync(join(cwd, file), 'utf8')).toBe(formatted)
})

test('frontmatter and fenced examples are stable across repeated formatting', () => {
  const file = 'guide.md'
  const cwd = fixture(
    file,
    '---\ntitle: Example\n---\n\n#  Guide\n\n```json\n{"value":1}\n```\n',
  )
  formatMarkdown([file], cwd, true)
  const first = readFileSync(join(cwd, file), 'utf8')
  formatMarkdown([file], cwd, true)
  expect(readFileSync(join(cwd, file), 'utf8')).toBe(first)
  expect(first).toContain('title: Example')
})
