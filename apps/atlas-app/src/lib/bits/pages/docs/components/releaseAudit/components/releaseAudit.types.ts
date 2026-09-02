export type AuditAction = {
  action: string
  affectedRecordCount: number
  evidence: unknown
  id: string
  mode: 'automatic' | 'manual'
  sourceCode?: string
  sourceReleaseCode?: string
  summary: string
}

export type AuditBulkMapping = { from: string; to: string }

export type AuditBulkRule = {
  condition?: string
  id?: string
  i18n: Array<{ description: string; locale: string }>
  mappings?: AuditBulkMapping[]
  operationCode: string
  sourceFieldPath?: string
  sourceCode?: string
  sourceReleaseCode?: string
  targetFieldPath?: string
  type: 'bulk' | 'record'
}

export type AuditRowPresentation = {
  leftLabel?: string
  leftValue: string | null
  rightItems?: Array<{ label: string; value: string }>
  rightLabel?: string
  rightTitle?: string
  rightValue?: string
}

export type AuditEvidenceCopyHandler = (
  id: string,
  evidence: unknown,
) => Promise<boolean>

export type AuditSection = {
  action: string
  affectedRecordCount: number
  hasMore?: boolean
  id: string
  mode: 'automatic' | 'manual'
  nextOffset?: number
  rows: AuditAction[]
  totalCount: number
}

export type AuditActionPage = {
  hasMore: boolean
  nextOffset: number
  rows: AuditAction[]
}
