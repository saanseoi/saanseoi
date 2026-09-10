import { createHash } from 'node:crypto'

/** Keep generated INSERT semantics, including its conflict clause, while staging large text. */
export function splitLargeInsertLiterals(statement: string, maxBytes = 99_000) {
  if (Buffer.byteLength(statement) <= maxBytes) return [statement]
  if (!/^INSERT(?: OR \w+)? INTO\b/i.test(statement.trimStart()))
    throw new Error('Only generated INSERT statements support staged SQL literals.')
  const literals: Array<{ start: number; end: number; text: string; bytes: number }> =
    []
  for (let index = 0; index < statement.length; index++) {
    if (statement[index] !== "'") continue
    const start = index++
    let closed = false
    for (; index < statement.length; index++) {
      if (statement[index] !== "'") {
        continue
      }
      if (statement[index + 1] === "'") {
        index++
      } else {
        closed = true
        break
      }
    }
    if (!closed) throw new Error('Unterminated generated SQL literal.')
    if (/[xX]/.test(statement[start - 1] ?? '')) continue
    literals.push({
      start,
      end: index + 1,
      text: statement.slice(start + 1, index).replaceAll("''", "'"),
      bytes: Buffer.byteLength(statement.slice(start, index + 1)),
    })
  }
  const table = `harbourSqlLiteral_${createHash('sha256').update(statement).digest('hex').slice(0, 24)}`
  const selected: typeof literals = []
  const render = () => {
    let offset = 0
    let sql = ''
    for (const literal of [...selected].sort((a, b) => a.start - b.start)) {
      sql += statement.slice(offset, literal.start)
      sql += `(SELECT value FROM "${table}" WHERE id = ${selected.indexOf(literal)})`
      offset = literal.end
    }
    return sql + statement.slice(offset)
  }
  let rewritten = statement
  for (const literal of literals.sort((a, b) => b.bytes - a.bytes)) {
    if (Buffer.byteLength(rewritten) <= maxBytes) break
    selected.push(literal)
    rewritten = render()
  }
  if (Buffer.byteLength(rewritten) > maxBytes)
    throw new Error('Generated INSERT exceeds the SQL budget even with staged text.')
  const statements = [
    `CREATE TABLE IF NOT EXISTS "${table}" (id INTEGER PRIMARY KEY, value TEXT NOT NULL);`,
    `DELETE FROM "${table}";`,
  ]
  for (const [id, literal] of selected.entries()) {
    statements.push(`INSERT INTO "${table}" (id, value) VALUES (${id}, '');`)
    const prefix = `UPDATE "${table}" SET value = value || '`
    const suffix = `' WHERE id = ${id};`
    const chunkSize = Math.min(
      8192,
      Math.floor((maxBytes - Buffer.byteLength(prefix + suffix)) / 4),
    )
    if (chunkSize < 2) throw new Error('SQL budget leaves no room for staged text.')
    for (let start = 0; start < literal.text.length; ) {
      let end = Math.min(start + chunkSize, literal.text.length)
      const last = literal.text.charCodeAt(end - 1)
      if (end < literal.text.length && last >= 0xd800 && last <= 0xdbff) end--
      statements.push(
        prefix + literal.text.slice(start, end).replaceAll("'", "''") + suffix,
      )
      start = end
    }
  }
  statements.push(rewritten, `DROP TABLE "${table}";`)
  if (statements.some(sql => Buffer.byteLength(sql) > maxBytes))
    throw new Error('Staged SQL statement exceeds the payload budget.')
  return statements
}
