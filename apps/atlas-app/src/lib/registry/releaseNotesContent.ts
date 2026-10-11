import type { AppLocale } from '#lib/bits/internal/i18n.js'

const headings = { en: 'EN', 'zh-Hant': 'ZH-HANT', 'zh-Hans': 'ZH-HANS' } as const

/** Preserve English fallback without mistaking locale headings for published notes. */
export function resolveReleaseNotesContent(
  source: string | null | undefined,
  locale: AppLocale,
) {
  const body = (source ?? '')
    .replaceAll('\r\n', '\n')
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .trim()
  const sections = [...body.matchAll(/^#\s+(EN|ZH-HANT|ZH-HANS)\s*$/gim)]
  if (!sections.length) return { markdown: body, hasPublishedNotes: Boolean(body) }
  const byLocale = new Map(
    sections.map((section, index) => [
      section[1]!.toUpperCase(),
      body
        .slice(
          section.index! + section[0].length,
          sections[index + 1]?.index ?? body.length,
        )
        .trim(),
    ]),
  )
  return {
    markdown: byLocale.get(headings[locale]) ?? byLocale.get('EN') ?? '',
    hasPublishedNotes: [...byLocale.values()].some(Boolean),
  }
}
