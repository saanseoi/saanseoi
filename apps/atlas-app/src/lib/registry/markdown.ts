import type { AppLocale } from '$lib/bits/internal/i18n'
import { diffLines } from 'diff'
import GithubSlugger from 'github-slugger'

const localeHeadings = {
  en: 'EN',
  'zh-Hant': 'ZH-HANT',
  'zh-Hans': 'ZH-HANS',
} satisfies Record<AppLocale, string>

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
}

export type MarkdownHeading = {
  id: string
  level: number
  text: string
}

type MarkdownDiffHeading = {
  level: number
  line: string
}

type MarkdownDiffOperation = {
  headingPath: MarkdownDiffHeading[]
  kind: 'added' | 'removed' | 'unchanged'
  line: string
}

export type MarkdownDiffChange = {
  addedMarkdown: string
  removedMarkdown: string
}

export type MarkdownDiff = {
  addedLines: number
  changes: MarkdownDiffChange[]
  removedLines: number
}

export function getMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const slugger = new GithubSlugger()
  const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm
  const headings: MarkdownHeading[] = []
  let match: RegExpExecArray | null

  while (true) {
    match = headingPattern.exec(markdown)
    if (!match) break

    const level = match[1]?.length
    const text = match[2]?.trim()
    if (!level || !text) continue

    headings.push({
      id: `source-heading-${slugger.slug(text)}`,
      level,
      text,
    })
  }

  return headings
}

function splitMarkdownLines(value: string) {
  if (!value) return []

  const lines = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function getHeading(line: string): MarkdownDiffHeading | null {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
  if (!match?.[1] || !match[2]) return null

  return {
    level: match[1].length,
    line,
  }
}

function updateHeadingPath(path: MarkdownDiffHeading[], line: string) {
  const heading = getHeading(line)
  if (!heading) return path

  return [...path.filter(current => current.level < heading.level), heading]
}

function buildChangedMarkdown(operations: MarkdownDiffOperation[]) {
  const lines: string[] = []
  const seenHeadings = new Set<string>()

  for (const operation of operations) {
    for (const heading of operation.headingPath) {
      const key = `${heading.level}:${heading.line}`
      if (seenHeadings.has(key)) continue
      seenHeadings.add(key)
      lines.push(heading.line)
    }

    lines.push(operation.line)
  }

  return lines.join('\n').trim()
}

/**
 * Returns only changed Markdown lines, carrying the active heading path into
 * every hunk so an isolated edit still has enough context to be understood.
 */
export function diffMarkdown(previous: string, current: string): MarkdownDiff {
  const changes: MarkdownDiffChange[] = []
  let addedLines = 0
  let removedLines = 0
  let previousHeadings: MarkdownDiffHeading[] = []
  let currentHeadings: MarkdownDiffHeading[] = []
  let operations: MarkdownDiffOperation[] = []

  const flushOperations = () => {
    if (operations.length === 0) return

    const added = operations.filter(operation => operation.kind === 'added')
    const removed = operations.filter(operation => operation.kind === 'removed')
    if (added.length || removed.length) {
      changes.push({
        addedMarkdown: buildChangedMarkdown(added),
        removedMarkdown: buildChangedMarkdown(removed),
      })
    }
    operations = []
  }

  for (const change of diffLines(previous, current, { ignoreNewlineAtEof: true })) {
    const kind = change.added ? 'added' : change.removed ? 'removed' : 'unchanged'
    const lines = splitMarkdownLines(change.value)

    for (const line of lines) {
      if (kind === 'unchanged') {
        flushOperations()
        previousHeadings = updateHeadingPath(previousHeadings, line)
        currentHeadings = updateHeadingPath(currentHeadings, line)
        continue
      }

      const headingPath = kind === 'removed' ? previousHeadings : currentHeadings
      operations.push({ kind, line, headingPath })
      if (kind === 'added') {
        addedLines += 1
        currentHeadings = updateHeadingPath(currentHeadings, line)
      } else {
        removedLines += 1
        previousHeadings = updateHeadingPath(previousHeadings, line)
      }
    }
  }
  flushOperations()

  return { addedLines, changes, removedLines }
}

export function selectLocaleMarkdown(
  markdown: string | null | undefined,
  locale: AppLocale,
) {
  if (!markdown) return ''

  const source = stripFrontmatter(markdown)
  const targetHeading = localeHeadings[locale]
  const sectionPattern = /^#\s+(.+?)\s*$/gm
  const sections: Array<{
    heading: string
    headingStart: number
    start: number
    end: number
  }> = []
  let match: RegExpExecArray | null

  while (true) {
    match = sectionPattern.exec(source)
    if (!match) break

    sections.push({
      heading: match[1]?.trim().toUpperCase() ?? '',
      headingStart: match.index,
      start: sectionPattern.lastIndex,
      end: source.length,
    })
  }

  for (let index = 0; index < sections.length; index += 1) {
    const currentSection = sections[index]
    const nextSection = sections[index + 1]
    if (currentSection && nextSection) {
      currentSection.end = nextSection.headingStart
    }
  }

  const section =
    sections.find(item => item.heading === targetHeading) ??
    sections.find(item => item.heading === 'EN')

  if (!section) return source

  return source.slice(section.start, section.end).trim()
}

export function selectMarkdownSection(markdown: string, heading: string) {
  const source = stripFrontmatter(markdown)
  const sectionPattern = /^##\s+(.+?)\s*$/gm
  const targetHeading = heading.trim().toLowerCase()
  let match: RegExpExecArray | null

  while (true) {
    match = sectionPattern.exec(source)
    if (!match) break

    if (match[1]?.trim().toLowerCase() !== targetHeading) continue

    const start = match.index
    const nextSection = sectionPattern.exec(source)
    const end = nextSection?.index ?? source.length
    return source.slice(start, end).trim()
  }

  throw new Error(`Markdown section not found: ${heading}`)
}

export function selectMarkdownHeadingPath(
  markdown: string,
  path: Array<{ heading: string; level: number }>,
) {
  let source = stripFrontmatter(markdown)

  for (const { heading, level } of path) {
    const headingPattern = new RegExp(`^#{${level}}\\s+(.+?)\\s*$`, 'gm')
    const targetHeading = heading.trim().toLowerCase()
    let match: RegExpExecArray | null
    let sectionStart = -1

    while (true) {
      match = headingPattern.exec(source)
      if (!match) break

      if (match[1]?.trim().toLowerCase() === targetHeading) {
        sectionStart = headingPattern.lastIndex
        break
      }
    }

    if (sectionStart === -1) {
      throw new Error(`Markdown heading not found: ${'#'.repeat(level)} ${heading}`)
    }

    const nextHeadingPattern = /^#{1,6}\s+.+?\s*$/gm
    nextHeadingPattern.lastIndex = sectionStart
    let sectionEnd = source.length

    while (true) {
      match = nextHeadingPattern.exec(source)
      if (!match) break

      const nextLevel = match[0].match(/^#+/)?.[0].length ?? 0
      if (nextLevel <= level) {
        sectionEnd = match.index
        break
      }
    }

    source = source.slice(sectionStart, sectionEnd).trim()
  }

  return source
}

export function stylizeSaanseoiInMarkdown(markdown: string) {
  return markdown.replaceAll('山水 | SaanSeoi', '<saanseoi>山水 | SaanSeoi</saanseoi>')
}
