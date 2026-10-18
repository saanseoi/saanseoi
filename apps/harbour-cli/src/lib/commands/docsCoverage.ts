import type { ApiReleaseSetDocsRow } from './docsTypes.ts'

const locales = ['EN', 'ZH-HANT', 'ZH-HANS'] as const

/** Check the entire publish plan before writing any documentation. */
export function assertCompleteApiReleaseSetDocumentation(
  rows: Pick<ApiReleaseSetDocsRow, 'code' | 'apiVersion' | 'notes' | 'guide'>[],
) {
  const missing: string[] = []
  for (const row of rows) {
    for (const field of ['notes', 'guide'] as const) {
      const body = (row[field] ?? '').replaceAll('\r\n', '\n')
      const sections = [...body.matchAll(/^#\s+(EN|ZH-HANT|ZH-HANS)[\t ]*$/gim)]
      for (const locale of locales) {
        const index = sections.findIndex(
          section => section[1]?.toUpperCase() === locale,
        )
        const section = sections[index]
        const content = section
          ? body
              .slice(section.index! + section[0].length, sections[index + 1]?.index)
              .trim()
          : ''
        if (!content)
          missing.push(`${row.apiVersion}/${row.code}: ${field} (${locale})`)
      }
    }
  }
  if (missing.length) {
    throw new Error(
      `Incomplete API release-set documentation. Add or complete the notes and guide fixtures under fixtures/meta/apiReleaseSets before publishing:\n${missing.join('\n')}`,
    )
  }
}
