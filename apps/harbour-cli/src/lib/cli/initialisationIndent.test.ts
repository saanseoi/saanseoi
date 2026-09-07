import { expect, test } from 'bun:test'
import { createIndentedOutput, initialisationIndent } from './initialisationIndent.ts'

test('all directly invoked commands start at zero and actual children add four spaces', () => {
  expect(initialisationIndent('init')).toBe(0)
  expect(initialisationIndent('init:local')).toBe(0)
  expect(initialisationIndent('init:production')).toBe(0)
  for (const family of ['addresses', 'divisions', 'places', 'stats', 'streets']) {
    expect(initialisationIndent(`init:${family}`)).toBe(0)
    expect(initialisationIndent(`init:${family}:source`)).toBe(0)
    expect(initialisationIndent(`init:${family}`, '0')).toBe(4)
    expect(initialisationIndent(`init:${family}:source`, '0')).toBe(4)
    expect(initialisationIndent(`init:${family}:source`, '0,4')).toBe(8)
  }
  expect(initialisationIndent('upload')).toBe(0)
  expect(initialisationIndent('upload', '0')).toBe(0)
  expect(initialisationIndent('upload', '0,4')).toBe(4)
  expect(initialisationIndent('docs:publish', '0,4,8')).toBe(8)
})

test('indents multiline output across writes and preserves blank lines', () => {
  const indent = createIndentedOutput(4)
  expect(indent('│\n◇ Title\n')).toBe('    │\n    ◇ Title\n')
  expect(indent('\npartial')).toBe('\n    partial')
  expect(indent(' line\n')).toBe(' line\n')
})

test('keeps coloured progress and absolute column redraws aligned', () => {
  const indent = createIndentedOutput(8)
  expect(indent('\u001b[32m◆ item\u001b[0m\n')).toBe(
    '\u001b[32m        ◆ item\u001b[0m\n',
  )
  expect(indent('\u001b[1G\u001b[J◆ next')).toBe('\u001b[9G\u001b[J◆ next')
  expect(indent('\r◆ done\n')).toBe('\r        ◆ done\n')
})

test('connects a nested command and carries its active parent through blank lines', () => {
  const indent = createIndentedOutput(8, [4], true)
  expect(indent('│\n◇ INITIALISATION\n\n│\n')).toBe(
    '    ├───╮\n    │   ◇ INITIALISATION\n    │   │\n    │   │\n',
  )
  expect(indent('└ complete\n')).toBe('    │   ├ complete\n')
})

test('ancestor guides use grey and restore the content foreground', () => {
  const indent = createIndentedOutput(4, [0], false, true)
  expect(indent('\u001b[36m◆ result\n')).toBe(
    '\u001b[36m\u001b[90m│   \u001b[39m\u001b[36m◆ result\n',
  )
  expect(indent('\u001b[39m\n')).toBe('\u001b[39m\u001b[90m│   │\u001b[39m\u001b[39m\n')
})

test('retains every active ancestor without adding guides for direct invocations', () => {
  expect(createIndentedOutput(8, [0, 4], true)('│\n')).toBe('│   ├───╮\n')
  expect(createIndentedOutput(8)('│\n')).toBe('        │\n')
})
