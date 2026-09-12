import type { Database } from 'bun:sqlite'
import { netKeyMatch, netRowKey } from './netSqlitePlanSchema.ts'
import { quoteNetIdentifier as q, type NetTable } from './netSqlitePlanTypes.ts'

/**
 * Preserve children moving away from a retired parent, including ON DELETE CASCADE.
 * Those parent deletions follow inserts and updates. Other removals stay first so
 * they release unique keys before replacement rows are inserted. SQLite retains
 * the dependency worklist on disk; no release-sized JS graph is required.
 */
export function postponeNetParentDeletions(input: {
  db: Database
  journalPath: string
  binding: string
  tables: NetTable[]
}) {
  const { db, binding, tables } = input
  db.query('ATTACH DATABASE ? AS net_journal').run(input.journalPath)
  try {
    const byName = new Map(tables.map(table => [table.policy.name, table]))
    const relations = tables.flatMap(child =>
      child.foreignKeys.map(reference => {
        const parent = byName.get(reference.parentTable)
        if (!parent) throw new Error('Missing parent table during net-plan ordering.')
        const relation = reference.parentColumns
          .map((column, index) => {
            const childColumn = reference.columns[index]
            if (!childColumn) throw new Error('Missing child foreign-key column.')
            return `p.${q(column)} = b.${q(childColumn)}`
          })
          .join(' AND ')
        return { child, parent, relation }
      }),
    )
    db.transaction(() => {
      for (const { child, parent, relation } of relations) {
        db.query(`INSERT OR IGNORE INTO net_journal.lateDeletes(binding,tableName,rowKey)
          SELECT ?,?,${netRowKey(parent, 'p')}
          FROM net_baseline.${q(parent.policy.name)} p
          JOIN net_journal.mutations m ON m.binding=? AND m.tableName=? AND m.kind='delete' AND m.rowKey=${netRowKey(parent, 'p')}
          WHERE EXISTS (
            SELECT 1 FROM net_baseline.${q(child.policy.name)} b
            JOIN main.${q(child.policy.name)} c ON ${netKeyMatch(child, 'b', 'c')}
            WHERE ${relation}
          )`).run(binding, parent.policy.name, binding, parent.policy.name)
      }
      // If a removed child must wait for its surviving descendants to move, its
      // removed parents must wait too. This also covers self-referencing trees.
      let changed: number
      do {
        changed = 0
        for (const { child, parent, relation } of relations) {
          const result = db
            .query(`INSERT OR IGNORE INTO net_journal.lateDeletes(binding,tableName,rowKey)
            SELECT ?,?,${netRowKey(parent, 'p')}
            FROM net_baseline.${q(parent.policy.name)} p
            JOIN net_journal.mutations m ON m.binding=? AND m.tableName=? AND m.kind='delete' AND m.rowKey=${netRowKey(parent, 'p')}
            WHERE EXISTS (
              SELECT 1 FROM net_baseline.${q(child.policy.name)} b
              JOIN net_journal.lateDeletes d ON d.binding=? AND d.tableName=? AND d.rowKey=${netRowKey(child, 'b')}
              WHERE ${relation}
            )`)
            .run(
              binding,
              parent.policy.name,
              binding,
              parent.policy.name,
              binding,
              child.policy.name,
            )
          changed += Number(result.changes)
        }
      } while (changed)
      db.query(`UPDATE net_journal.mutations SET sortOrder=sortOrder+?
        WHERE binding=? AND kind='delete' AND EXISTS (
          SELECT 1 FROM net_journal.lateDeletes d WHERE d.binding=mutations.binding
          AND d.tableName=mutations.tableName AND d.rowKey=mutations.rowKey
        )`).run(tables.length * 3, binding)
    })()
  } finally {
    db.exec('DETACH DATABASE net_journal')
  }
}
