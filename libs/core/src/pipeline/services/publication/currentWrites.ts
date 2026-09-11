import { sql, type SQL } from '@repo/db'

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

/** Metadata-only reassertions do not write current records. NULLs compare exactly. */
export function currentRowChangedSqlText(
  table: string,
  columns: readonly string[],
  ignored: readonly string[] = ['createdAt', 'updatedAt'],
) {
  const compared = columns.filter(column => !ignored.includes(column))
  if (!compared.length) throw new Error('Current writes require comparable content.')
  return compared
    .map(column => `${quote(table)}.${quote(column)} IS NOT excluded.${quote(column)}`)
    .join(' OR ')
}

export function currentRowChangedSql(
  table: string,
  columns: readonly string[],
  ignored?: readonly string[],
): SQL {
  return sql.raw(currentRowChangedSqlText(table, columns, ignored))
}
