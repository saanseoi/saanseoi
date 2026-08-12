const auditSlug = (value: string) =>
  value
    .replaceAll(/[^a-zA-Z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase()

export const auditHeadingId = (kind: 'bulk' | 'record', value: string) =>
  kind === 'bulk' ? `audit-bulk-${auditSlug(value)}` : `audit-${auditSlug(value)}`

export const formatAuditOperationCode = (value: string) => {
  const sentence = value.replaceAll('_', ' ').trim()
  const firstCharacter = sentence.at(0)
  return firstCharacter
    ? `${firstCharacter.toLocaleUpperCase()}${sentence.slice(1)}`
    : sentence
}
