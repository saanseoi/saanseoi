import { insertSqlParts } from './processLocalPlaceSqlUploadImport.ts'
import { MAX_SQL_BYTES } from './processLocalPlaceSqlUploadConfig.ts'

/** Only independent snapshot projection inserts may be regrouped. */
export class PlaceProjectionSql {
  constructor(
    private readonly maxBytes = MAX_SQL_BYTES,
    private readonly currentProjection = false,
  ) {}
  private groups = new Map<
    string,
    {
      prefix: string
      suffix: string
      rows: string[]
      bytes: number
      statements: string[]
    }
  >()

  add(table: string, values: Record<string, unknown>) {
    const [prefix, row, suffix] = insertSqlParts(
      table,
      values,
      false,
      this.currentProjection,
    )
    const key = prefix + suffix
    let group = this.groups.get(key)
    if (!group) {
      group = {
        prefix,
        suffix,
        rows: [],
        bytes: Buffer.byteLength(prefix + suffix),
        statements: [],
      }
      this.groups.set(key, group)
    }
    const bytes = Buffer.byteLength(row) + (group.rows.length ? 1 : 0)
    if (group.rows.length && group.bytes + bytes > this.maxBytes) {
      group.statements.push(prefix + group.rows.join(',') + suffix)
      group.rows = []
      group.bytes = Buffer.byteLength(prefix + suffix)
    }
    group.rows.push(row)
    group.bytes += Buffer.byteLength(row) + (group.rows.length > 1 ? 1 : 0)
  }

  finish() {
    return [...this.groups.values()].flatMap(group => [
      ...group.statements,
      ...(group.rows.length
        ? [group.prefix + group.rows.join(',') + group.suffix]
        : []),
    ])
  }
}
