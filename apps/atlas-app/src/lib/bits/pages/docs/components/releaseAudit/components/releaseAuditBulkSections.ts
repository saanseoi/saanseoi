import type { AuditBulkMapping, AuditBulkRule } from './releaseAudit.types'
import { matchesFuzzyQuery } from './releaseAuditSearch'
import { auditHeadingId, formatAuditOperationCode } from './releaseAuditUtils'

export type { AuditBulkRule }

export const bulkSectionHeadingId = (operationCode: string) =>
  auditHeadingId('bulk', operationCode)

const searchableHeaderText = (rule: AuditBulkRule) =>
  [
    rule.operationCode,
    formatAuditOperationCode(rule.operationCode),
    rule.sourceFieldPath,
    rule.targetFieldPath,
    rule.condition,
    ...rule.i18n.map(item => item.description),
  ].join(' ')

const searchableMappingText = (mapping: AuditBulkMapping) =>
  `${mapping.from} ${mapping.to}`

export const filterBulkProcessingSections = (rules: AuditBulkRule[], query: string) =>
  rules.flatMap(rule => {
    if (matchesFuzzyQuery(searchableHeaderText(rule), query)) return [rule]

    const mappings = rule.mappings?.filter(mapping =>
      matchesFuzzyQuery(searchableMappingText(mapping), query),
    )
    return mappings?.length ? [{ ...rule, mappings }] : []
  })
