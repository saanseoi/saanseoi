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
