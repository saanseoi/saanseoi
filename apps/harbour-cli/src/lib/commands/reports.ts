import { isReleaseId } from '@repo/core'

import {
  formatIngestionReportTable,
  formatReleaseReportTable,
  formatStatsReportTable,
} from '../cli/display.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../cli/options.ts'
import {
  fetchProcessingRunReport,
  fetchReleaseReport,
  fetchStatsReport,
} from '../api/reporting.ts'

export async function runReportCommand(args: ParsedArgs, target: UploadTarget) {
  const reportLimit =
    typeof args.options.limit === 'string'
      ? Number.parseInt(args.options.limit, 10)
      : 10
  const reportSource = getStringOption(args, ['source'])
  const reportType = getStringOption(args, ['resource-type'])
  const hasExplicitLimit = typeof args.options.limit === 'string'

  if (args.command === 'reports:ingestion') {
    const report = await fetchProcessingRunReport(target, {
      limit: hasExplicitLimit ? reportLimit : 100,
      ...resolveReportReleaseFilter(args),
      source: reportSource,
      resourceType: reportType,
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
      resourceType: reportType,
    })
    console.log(formatStatsReportTable(report.rows))
    return
  }

  if (args.command === 'reports:releases') {
    const report = await fetchReleaseReport(target, {
      limit: reportLimit,
      ...resolveReportReleaseFilter(args),
      source: reportSource,
      resourceType: reportType,
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
    ? { resourceReleaseId: releaseSpecifier }
    : { releaseCode: releaseSpecifier }
}
