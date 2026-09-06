import { cancel, isCancel, select } from '@clack/prompts'
import { compareReleaseVersions } from '@repo/core'
import { getStringOption, type ParsedArgs } from '../cli/options.ts'
import type {
  DocsScope,
  ParsedApiReleaseSetDocsRow,
  ParsedReleaseSetCode,
  PublishDocsScope,
  ReleaseDocsRow,
} from './docsTypes.ts'

export function groupRowsByDocsScope(rows: ParsedApiReleaseSetDocsRow[]) {
  const grouped = new Map<string, ParsedApiReleaseSetDocsRow[]>()

  for (const row of rows) {
    const docsScope = `${row.parsedCode.regionCode}:${row.parsedCode.apiFamily}`

    grouped.set(docsScope, [...(grouped.get(docsScope) ?? []), row])
  }

  return grouped
}

export function groupReleaseRowsByDataset(rows: ReleaseDocsRow[]) {
  const grouped = new Map<string, ReleaseDocsRow[]>()

  for (const row of rows) {
    grouped.set(row.datasetCode, [...(grouped.get(row.datasetCode) ?? []), row])
  }

  return grouped
}

function resolveSingleReleaseForCohort(rows: ReleaseDocsRow[], cohortKey: string) {
  const matches = rows.filter(row => row.cohortKey === cohortKey)

  if (matches.length > 1) {
    throw new Error(
      `Multiple releases found for cohort ${cohortKey}: ${matches.map(row => row.code).join(', ')}`,
    )
  }

  return matches[0] ?? null
}

export async function resolveSelectedRelease(input: {
  cohortOption: string | undefined
  datasetCode: string
  releaseOption: string | undefined
  rows: ReleaseDocsRow[]
}) {
  if (input.releaseOption) {
    return input.rows.find(row => row.code === input.releaseOption) ?? null
  }

  if (input.cohortOption) {
    return resolveSingleReleaseForCohort(input.rows, input.cohortOption)
  }

  if (input.rows.length === 0) {
    return null
  }

  const selectedCode = await select({
    message: `Select release for ${input.datasetCode}`,
    options: input.rows
      .slice()
      .reverse()
      .map(row => ({
        label: row.code,
        hint: [
          row.cohortKey ? `cohort ${row.cohortKey}` : null,
          `source ${row.sourceVersion}`,
          row.status,
        ]
          .filter((value): value is string => Boolean(value))
          .join(' · '),
        value: row.code,
      })),
  })

  if (isCancel(selectedCode)) {
    cancel('DOCS NEW CANCELLED')
    process.exit(1)
  }

  return input.rows.find(row => row.code === selectedCode) ?? null
}

export function parseReleaseSetCode(code: string): ParsedReleaseSetCode | null {
  const match = /^data-([a-z0-9]+)-([a-z]+)-(.+?)(?:-r(\d+))?(?:--[a-z0-9-]+)?$/.exec(
    code,
  )

  if (!match) {
    return null
  }

  const [, regionCode, apiFamily, cohortKey, revision] = match

  if (!regionCode || !apiFamily || !cohortKey) {
    return null
  }

  return {
    regionCode,
    apiFamily,
    cohortKey,
    sequence: Number.parseInt(revision ?? '0', 10),
  }
}

export function compareReleaseSetRows(
  left: ParsedApiReleaseSetDocsRow,
  right: ParsedApiReleaseSetDocsRow,
) {
  return (
    left.parsedCode.apiFamily.localeCompare(right.parsedCode.apiFamily) ||
    left.parsedCode.regionCode.localeCompare(right.parsedCode.regionCode) ||
    left.parsedCode.cohortKey.localeCompare(right.parsedCode.cohortKey) ||
    left.parsedCode.sequence - right.parsedCode.sequence ||
    left.code.localeCompare(right.code)
  )
}

export function compareReleaseRows(left: ReleaseDocsRow, right: ReleaseDocsRow) {
  return (
    left.datasetCode.localeCompare(right.datasetCode) ||
    compareReleaseVersions(left.sourceVersion, right.sourceVersion) ||
    (left.cohortKey ?? '').localeCompare(right.cohortKey ?? '') ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.code.localeCompare(right.code)
  )
}

export async function resolveDocsNewScope(args: ParsedArgs): Promise<DocsScope> {
  const explicitScope = getStringOption(args, ['scope', 'docs-scope'])

  if (explicitScope) {
    return parseDocsScope(explicitScope)
  }

  if (args.options.releases) {
    return 'releases'
  }

  const selectedScope = await promptDocsScope({
    message: 'Create docs for',
    options: ['apiReleaseSets', 'releases'],
  })

  if (selectedScope === 'all') {
    throw new Error('`all` is only supported for `docs:publish`.')
  }

  return selectedScope
}

export async function resolveDocsPublishScope(
  args: ParsedArgs,
): Promise<PublishDocsScope> {
  const explicitScope = getStringOption(args, ['scope', 'docs-scope'])

  if (explicitScope) {
    return parsePublishDocsScope(explicitScope)
  }

  if (args.options.releases) {
    return 'releases'
  }

  return promptDocsScope({
    message: 'Publish docs for',
    options: ['all', 'apiReleaseSets', 'releases'],
  })
}

function parseDocsScope(value: string): DocsScope {
  const scope = parsePublishDocsScope(value)

  if (scope === 'all') {
    throw new Error('`all` is only supported for `docs:publish`.')
  }

  return scope
}

function parsePublishDocsScope(value: string): PublishDocsScope {
  switch (value) {
    case 'all':
      return 'all'
    case 'api':
    case 'api-release-set':
    case 'api-release-sets':
    case 'apiReleaseSet':
    case 'apiReleaseSets':
      return 'apiReleaseSets'
    case 'release':
    case 'releases':
    case 'dataset-release':
    case 'dataset-releases':
      return 'releases'
    default:
      throw new Error(
        `Unsupported docs scope: ${value}. Expected apiReleaseSets, releases, or all.`,
      )
  }
}

async function promptDocsScope(input: {
  message: string
  options: PublishDocsScope[]
}): Promise<PublishDocsScope> {
  const selected = await select<PublishDocsScope>({
    message: input.message,
    options: input.options.map(value => ({
      label: formatDocsScopeLabel(value),
      value,
    })),
  })

  if (isCancel(selected)) {
    cancel('DOCS CANCELLED')
    process.exit(1)
  }

  return selected
}

function formatDocsScopeLabel(scope: PublishDocsScope) {
  switch (scope) {
    case 'apiReleaseSets':
      return 'API release sets'
    case 'releases':
      return 'Releases'
    case 'all':
      return 'All'
  }
}
