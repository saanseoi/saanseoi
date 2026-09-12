import { Database } from 'bun:sqlite'
import { expect, spyOn, test } from 'bun:test'
import { postponeNetParentDeletions } from './netSqlitePlanDependencies.ts'
import { readNetTables } from './netSqlitePlanSchema.ts'

test('retirement dependency queries probe journal row keys after scanning baseline rows', () => {
  const db = new Database(':memory:')
  db.exec(`ATTACH DATABASE ':memory:' AS net_baseline;
    CREATE TABLE parent(id TEXT PRIMARY KEY);
    CREATE TABLE child(id TEXT PRIMARY KEY, parentId TEXT REFERENCES parent(id));
    CREATE TABLE net_baseline.parent(id TEXT PRIMARY KEY);
    CREATE TABLE net_baseline.child(id TEXT PRIMARY KEY, parentId TEXT REFERENCES parent(id));
    CREATE INDEX net_baseline.child_parent ON child(parentId);
    INSERT INTO net_baseline.parent VALUES('old');
    INSERT INTO net_baseline.child VALUES('child','old');
    INSERT INTO parent VALUES('new');
    INSERT INTO child VALUES('child','new');`)
  const tables = readNetTables(db, [{ name: 'parent' }, { name: 'child' }])
  const query = db.query.bind(db)
  const exec = db.exec.bind(db)
  const plans: string[][] = []
  const querySpy = spyOn(db, 'query').mockImplementation(((sql: string) => {
    if (sql.startsWith('ATTACH DATABASE')) {
      // Initialise the private, in-memory journal immediately after attachment.
      return {
        run: () => {
          exec(`ATTACH DATABASE ':memory:' AS net_journal;
            CREATE TABLE net_journal.mutations(binding TEXT,tableName TEXT,kind TEXT,rowKey TEXT,sortOrder INTEGER);
            CREATE INDEX net_journal.mutations_row ON mutations(binding,tableName,kind,rowKey);
            CREATE TABLE net_journal.lateDeletes(binding TEXT,tableName TEXT,rowKey TEXT,PRIMARY KEY(binding,tableName,rowKey));
            INSERT INTO net_journal.mutations VALUES('CURRENT','parent','delete',json_array('text',hex('old')),1);`)
        },
      } as ReturnType<typeof db.query>
    }
    if (sql.startsWith('INSERT OR IGNORE INTO net_journal.lateDeletes')) {
      const params = sql.includes('d.binding=?')
        ? ['CURRENT', 'parent', 'CURRENT', 'parent', 'CURRENT', 'child']
        : ['CURRENT', 'parent', 'CURRENT', 'parent']
      const explain = db.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      try {
        plans.push(
          explain.all(...params).map(row => (row as { detail: string }).detail),
        )
      } finally {
        explain.finalize()
      }
    }
    return query(sql)
  }) as typeof db.query)
  try {
    postponeNetParentDeletions({
      db,
      journalPath: ':memory:',
      binding: 'CURRENT',
      tables,
    })
    expect(plans).toHaveLength(2)
    for (const details of plans) {
      expect(details.some(detail => /SEARCH m .*rowKey=\?/.test(detail))).toBe(true)
      expect(details.findIndex(detail => detail.startsWith('SCAN p'))).toBeLessThan(
        details.findIndex(detail => detail.startsWith('SEARCH m')),
      )
    }
    expect(plans[1]?.some(detail => /SEARCH d .*rowKey=\?/.test(detail))).toBe(true)
  } finally {
    querySpy.mockRestore()
    db.close()
  }
})
