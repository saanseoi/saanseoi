export type CenstatdMeasureTableLocale = 'en' | 'zh-Hant' | 'zh-Hans'

type CenstatdMeasureTableManifest = {
  measures: Array<{
    localisations: Array<{
      description: string
      locale: CenstatdMeasureTableLocale
      name: string
    }>
    measureCode: string
  }>
}

export function parseCenstatdMeasureTableManifest(
  value: unknown,
  path: string,
): CenstatdMeasureTableManifest {
  if (
    !value ||
    typeof value !== 'object' ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((value as { measures?: unknown }).measures)
  ) {
    throw new Error(`Invalid C&SD measure curation manifest: ${path}`)
  }

  const measures = (value as { measures: unknown[] }).measures.map((measure, index) => {
    if (!measure || typeof measure !== 'object') {
      throw new Error(`Invalid C&SD measure curation entry ${index + 1}: ${path}`)
    }

    const entry = measure as {
      localisations?: unknown
      measureCode?: unknown
    }
    if (
      typeof entry.measureCode !== 'string' ||
      !/^[a-z][A-Za-z0-9]*$/.test(entry.measureCode) ||
      !Array.isArray(entry.localisations)
    ) {
      throw new Error(`Invalid C&SD measure curation entry ${index + 1}: ${path}`)
    }

    const localisations = entry.localisations.map((localisation, localisationIndex) => {
      if (!localisation || typeof localisation !== 'object') {
        throw new Error(
          `Invalid C&SD measure localisation ${index + 1}.${localisationIndex + 1}: ${path}`,
        )
      }
      const value = localisation as {
        description?: unknown
        locale?: unknown
        name?: unknown
      }
      if (
        typeof value.description !== 'string' ||
        typeof value.name !== 'string' ||
        !isCenstatdMeasureTableLocale(value.locale)
      ) {
        throw new Error(
          `Invalid C&SD measure localisation ${index + 1}.${localisationIndex + 1}: ${path}`,
        )
      }
      return value as CenstatdMeasureTableManifest['measures'][number]['localisations'][number]
    })

    return {
      localisations,
      measureCode: entry.measureCode,
    }
  })

  return { measures }
}

function isCenstatdMeasureTableLocale(
  value: unknown,
): value is CenstatdMeasureTableLocale {
  return value === 'en' || value === 'zh-Hant' || value === 'zh-Hans'
}

export function renderCenstatdMeasureTable(
  manifest: CenstatdMeasureTableManifest,
  locale: CenstatdMeasureTableLocale,
) {
  const lines = ['| measureCode | name | description |', '| --- | --- | --- |']

  for (const measure of manifest.measures) {
    const localisation = measure.localisations.find(entry => entry.locale === locale)
    if (!localisation) {
      throw new Error(
        `C&SD measure ${measure.measureCode} has no ${locale} localisation for the release-note table.`,
      )
    }
    lines.push(
      `| \`${escapeMarkdownTableCell(measure.measureCode)}\` | ${escapeMarkdownTableCell(localisation.name)} | ${escapeMarkdownTableCell(localisation.description)} |`,
    )
  }

  return lines.join('\n')
}

export function escapeMarkdownTableCell(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', '<br>')
}
