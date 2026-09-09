export const auditSearchText = (...values: unknown[]) =>
  values
    .map(value => (typeof value === 'string' ? value : JSON.stringify(value)))
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
export function matchesAuditText(query: string, text: string) {
  return query
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every(term => text.includes(term))
}

export function matchesAudit(query: string, ...values: unknown[]) {
  return !query.trim() || matchesAuditText(query, auditSearchText(...values))
}
