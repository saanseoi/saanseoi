export const AUDIT_COMMIT_START = 'SELECT 1 /* saanseoi-audit-commit:start */;'
export const AUDIT_COMMIT_END = 'SELECT 1 /* saanseoi-audit-commit:end */;'

/** Preserve the audit visibility switch through statement and byte batching. */
export function groupAuditSqlStatements(statements: string[], maxStatements: number) {
  const groups: string[][] = []
  let pending: string[] = []
  let atomic: string[] | null = null
  const flush = () => {
    if (pending.length) groups.push(pending)
    pending = []
  }
  for (const statement of statements) {
    if (statement === AUDIT_COMMIT_START) {
      if (atomic) throw new Error('Nested audit SQL commit.')
      flush()
      atomic = []
    } else if (statement === AUDIT_COMMIT_END) {
      if (!atomic?.length) throw new Error('Invalid audit SQL commit end.')
      groups.push(atomic)
      atomic = null
    } else if (atomic) {
      atomic.push(statement)
      if (atomic.length > 200) throw new Error('Audit commit exceeds statement budget.')
    } else {
      pending.push(statement)
      if (pending.length >= maxStatements) flush()
    }
  }
  if (atomic) throw new Error('Incomplete audit SQL commit.')
  flush()
  return groups
}
