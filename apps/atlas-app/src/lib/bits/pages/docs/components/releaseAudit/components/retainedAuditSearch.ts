export function matchesAudit(query: string, ...values: unknown[]) {
  const text = values
    .map(value => (typeof value === 'string' ? value : JSON.stringify(value)))
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
  return query
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every(term => text.includes(term))
}
