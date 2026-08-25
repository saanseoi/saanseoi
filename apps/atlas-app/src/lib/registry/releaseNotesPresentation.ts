import {
  reference_close_transclusion,
  reference_show_transclusion,
  source_notes_empty,
} from '@repo/i18n/messages'
import type { AppLocale } from '#lib/bits/internal/i18n.js'
import type { ReleaseNotesPresentation } from '#lib/bits/pages/docs/components/releaseNotes/index.js'

import {
  getMarkdownHeadings,
  selectLocaleMarkdown,
  styliseSaanseoiInMarkdown,
} from './markdown'
import {
  getMarkdownTransclusion,
  getMarkdownTransclusionDisplayTitle,
} from './referenceDocs'

/** Resolves registry and locale concerns into data safe for release-note components. */
export function getReleaseNotesPresentation(
  source: string | null | undefined,
  locale: AppLocale,
  relatedMarkdown: Array<string | null | undefined> = [],
): ReleaseNotesPresentation {
  return buildReleaseNotesPresentation(
    selectReleaseNotesMarkdown(source, locale),
    locale,
    relatedMarkdown.map(document => selectReleaseNotesMarkdown(document, locale)),
  )
}

/** Selects a release's locale before any presentational Markdown transforms. */
export function selectReleaseNotesMarkdown(
  source: string | null | undefined,
  locale: AppLocale,
) {
  return selectLocaleMarkdown(source, locale)
}

/** Builds the resolved, presentation-only contract consumed by release-note UI. */
export function buildReleaseNotesPresentation(
  source: string,
  locale: AppLocale,
  relatedMarkdown: string[] = [],
): ReleaseNotesPresentation {
  const markdown = styliseSaanseoiInMarkdown(source)
  const transclusions: ReleaseNotesPresentation['transclusions'] = {}

  const documents = [markdown, ...relatedMarkdown.map(styliseSaanseoiInMarkdown)]
  for (const document of documents) {
    for (const href of document?.match(/saanseoi:[^\s)]+/g) ?? []) {
      if (transclusions[href]) continue
      const transclusion = getMarkdownTransclusion(href)
      if (!transclusion) continue

      const transclusionMarkdown = styliseSaanseoiInMarkdown(transclusion.markdown)
      transclusions[href] = {
        type: transclusion.type,
        title: getMarkdownTransclusionDisplayTitle(transclusion, locale),
        version: transclusion.version,
        markdown: transclusionMarkdown,
      }
      documents.push(transclusionMarkdown)
    }
  }

  return {
    markdown,
    headings: getMarkdownHeadings(markdown).filter(heading => heading.level >= 2),
    labels: {
      empty: source_notes_empty({}, { locale }),
      closeTransclusion: reference_close_transclusion({}, { locale }),
      showTransclusion: title => reference_show_transclusion({ title }, { locale }),
    },
    transclusions,
  }
}
