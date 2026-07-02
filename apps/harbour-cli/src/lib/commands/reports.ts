import { isReleaseId } from '@repo/core'

import {
  formatIngestionReportTable,
  formatReleaseReportTable,
  formatStatsReportTable,
} from '../display.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../options.ts'
import {
  fetchIngestRunReport,
  fetchReleaseReport,
  fetchStatsReport,
} from '../reporting.ts'

export async function runReportCommand(args: ParsedArgs, target: UploadTarget) {
  const reportLimit =
    typeof args.options.limit === 'string'
      ? Number.parseInt(args.options.limit, 10)
      : 10
  const reportSource = getStringOption(args, ['source'])
  const reportType = getStringOption(args, ['type'])
  const hasExplicitLimit = typeof args.options.limit === 'string'

  if (args.command === 'reports:ingestion') {
    const report = await fetchIngestRunReport(target, {
      limit: hasExplicitLimit ? reportLimit : 100,
      ...resolveReportReleaseFilter(args),
      source: reportSource,
      type: reportType,
    })
    console.log(
      formatIngestionReportTable(report.rows, {
        applyDefaultReleaseFilter: !hasExplicitLimit,
      }),
    )
    return
  }

  if (args.command === 'reports:stats') {
    const report = await fetchStatsReport(target, {
      limit: hasExplicitLimit ? reportLimit : 1,
      source: reportSource,
      type: reportType,
    })
    console.log(formatStatsReportTable(report.rows))
    return
  }

  if (args.command === 'reports:releases') {
    const report = await fetchReleaseReport(target, {
      limit: reportLimit,
      ...resolveReportReleaseFilter(args),
      source: reportSource,
      type: reportType,
    })
    console.log(formatReleaseReportTable(report.rows))
    return
  }

  throw new Error(`Unsupported report command: ${String(args.command)}`)
}

function resolveReportReleaseFilter(args: ParsedArgs) {
  const releaseSpecifier = getStringOption(args, ['release'])

  if (!releaseSpecifier) {
    return {}
  }

  return isReleaseId(releaseSpecifier)
    ? { releaseId: releaseSpecifier }
    : { releaseCode: releaseSpecifier }
}
