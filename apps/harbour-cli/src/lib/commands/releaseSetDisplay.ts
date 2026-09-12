import { formatMutedValue } from '../cli/display.ts'
import { parseReleaseSetCode } from './docsSelection.ts'
import { colorize } from './updateFormatting.ts'

/** Colour each stable release-set component without making a rainbow of its code. */
export function formatApiReleaseSetCode(code: string) {
  const parsed = parseReleaseSetCode(code)
  if (!parsed) return colorize(code, 33)

  const revision = parsed.sequence > 0 ? `-r${parsed.sequence}` : ''
  const base = `data-${parsed.regionCode}-${parsed.apiFamily}-${parsed.cohortKey}${revision}`
  const suffix = code.startsWith(base) ? code.slice(base.length) : ''
  return [
    colorize('data', 90),
    colorize(`-${parsed.regionCode}`, 36),
    colorize(`-${parsed.apiFamily}`, apiReleaseSetFamilyColour(parsed.apiFamily)),
    colorize(`-${parsed.cohortKey}`, 33),
    revision ? colorize(revision, 35) : '',
    suffix ? formatMutedValue(suffix) : '',
  ].join('')
}

/** Compact, component-coloured rows for large documentation publish batches. */
export function formatApiReleaseSetDocsGrid(codes: readonly string[]) {
  return codes.map(code => {
    const parsed = parseReleaseSetCode(code)
    if (!parsed) return `  ${colorize(code, 33)}`

    const revision = `r${parsed.sequence}`
    const suffix = releaseSetSuffix(code, parsed)
    return [
      `  ${colorize(parsed.apiFamily.padEnd(12), apiReleaseSetFamilyColour(parsed.apiFamily))}`,
      colorize(parsed.cohortKey.padStart(16), 33),
      colorize(revision.padStart(4), 35),
      suffix ? formatMutedValue(suffix) : '',
    ]
      .filter(Boolean)
      .join('  ')
      .trimEnd()
  })
}

/** Compact publisher, dataset, and version rows for source-release documentation batches. */
export function formatReleaseDocsGrid(
  rows: ReadonlyArray<{
    datasetCode: string
    regionCode: string
    source: string
    sourceVersion: string
  }>,
) {
  return rows.map(row => {
    const datasetPrefix = `ds-${row.regionCode}-${row.source}-`
    const dataset = row.datasetCode.startsWith(datasetPrefix)
      ? row.datasetCode.slice(datasetPrefix.length)
      : row.datasetCode

    return [
      `  ${colorize(row.source.padEnd(18), 35)}`,
      colorize(dataset.padEnd(20), 34),
      colorize(row.sourceVersion, 33),
    ]
      .join('  ')
      .trimEnd()
  })
}

function releaseSetSuffix(
  code: string,
  parsed: ReturnType<typeof parseReleaseSetCode>,
) {
  if (!parsed) return ''
  const revision = parsed.sequence > 0 ? `-r${parsed.sequence}` : ''
  const base = `data-${parsed.regionCode}-${parsed.apiFamily}-${parsed.cohortKey}${revision}`
  return code.startsWith(base) ? code.slice(base.length) : ''
}

function apiReleaseSetFamilyColour(apiFamily: string) {
  switch (apiFamily) {
    case 'addresses':
      return 34
    case 'divisions':
      return 35
    case 'places':
      return 33
    case 'stats':
      return 32
    default:
      return 37
  }
}
