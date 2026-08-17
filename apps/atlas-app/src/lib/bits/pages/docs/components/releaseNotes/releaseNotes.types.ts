import type { MarkdownHeading } from '#lib/registry/markdown.js'

export type ReleaseNotesTransclusion = {
  type: 'definition' | 'note'
  title: string
  version: string
  markdown: string
}

export type ReleaseNotesLabels = {
  empty: string
  closeTransclusion: string
  showTransclusion: (title: string) => string
}

export type ReleaseNotesPresentation = {
  markdown: string
  headings: MarkdownHeading[]
  labels: ReleaseNotesLabels
  transclusions: Record<string, ReleaseNotesTransclusion>
}
