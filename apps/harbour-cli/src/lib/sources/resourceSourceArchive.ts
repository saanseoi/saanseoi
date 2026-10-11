import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parquetWriteFile } from 'hyparquet-writer'

/** A portable source-table export: complex values retain their JSON representation. */
export async function writeResourceSourceParquet(
  directory: string,
  tables: Array<{ name: string; rows: Record<string, unknown>[] }>,
) {
  const rows = tables.flatMap(table =>
    table.rows.map(row => ({ ...row, sourceTable: table.name })),
  )
  const names = [...new Set(rows.flatMap(row => Object.keys(row)))].sort()
  const columnData = names.map(name => {
    const values = rows.map(row => (row as Record<string, unknown>)[name] ?? null)
    const present = values.filter(value => value !== null)
    const type =
      present.length && present.every(value => typeof value === 'number')
        ? ('DOUBLE' as const)
        : present.length && present.every(value => typeof value === 'boolean')
          ? ('BOOLEAN' as const)
          : ('STRING' as const)
    return {
      name,
      type,
      data: values.map(value =>
        value === null
          ? null
          : type !== 'STRING' || typeof value === 'string'
            ? value
            : JSON.stringify(value),
      ),
      nullable: true,
    }
  })
  await mkdir(directory, { recursive: true })
  const filePath = join(directory, 'resource-source.parquet')
  parquetWriteFile({ filename: filePath, columnData })
  return filePath
}
