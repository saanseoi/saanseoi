import { expect, test } from 'bun:test'
import { historyEventsSqlForTables, historyEventTables } from './historyEvents'

test('HISTORY views preserve every event under the workerd compound SELECT limit', () => {
  const definitions = Object.values(historyEventTables)
  const tables = definitions
    .map(definition => {
      const columns = new Set([
        'snapshotId',
        'versionHash',
        'operation',
        'sourceReleaseId',
        'createdAt',
        'updatedAt',
        ...definition.keys,
        ...('locale' in definition ? [definition.locale] : []),
      ])
      return `CREATE TABLE "${definition.table}" (${[...columns].map(column => `"${column}" TEXT`).join(',')});
      INSERT INTO "${definition.table}" DEFAULT VALUES;`
    })
    .join('\n')
  const child = Bun.spawnSync(
    [
      'python3',
      '-c',
      `
import json, sqlite3, sys
schema, full, partial = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT, 5)
db.executescript(schema)
db.execute('CREATE VIEW historyEvents AS ' + full)
print(json.dumps([row[0] for row in db.execute('SELECT recordType FROM historyEvents')]))
print(json.dumps([row[1] for row in db.execute(partial)]))
`,
    ],
    {
      stdin: Buffer.from(
        JSON.stringify([
          tables,
          historyEventsSqlForTables(),
          historyEventsSqlForTables(new Set(['divisions', 'places'])),
        ]),
      ),
    },
  )
  expect(child.exitCode, child.stderr.toString()).toBe(0)
  const [full, partial] = child.stdout
    .toString()
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  expect(full).toEqual(Object.keys(historyEventTables))
  expect(partial).toEqual(['division', 'place'])
})
