export type AuditAction = {
  action: string
  affectedRecordCount: number
  evidence: unknown
  id: string
  mode: 'automatic' | 'manual'
  summary: string
}

export type AuditBulkMapping = { from: string; to: string }

export type AuditBulkRule = {
  condition?: string
  i18n: Array<{ description: string; locale: string }>
  mappings?: AuditBulkMapping[]
  operationCode: string
  sourceFieldPath?: string
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

export type AuditSection = {
  action: string
  affectedRecordCount: number
  id: string
  mode: string
  rows: AuditAction[]
  totalCount: number
}
