import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '../../../testing/localDb'
import {
  InventorySelectionError,
  selectApiInventory,
} from '../../../lib/db/apiInventory'
import { divisionSearchIndex } from './divisions'
import { resolvePublishedSearchScopes } from './incrementalIndex'

function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec('CREATE TABLE snapshots(id TEXT, snapshotLineageId TEXT)')
  const member = (variant: string, role = 'primary') => ({
    snapshotId: variant,
    snapshotResourceType: 'division',
    variant,
    role,
  })
  const domains = {
    geographic: [member('saanseoi'), member('overture', 'inventory')],
    planning: [member('planning')],
  }
  for (const id of ['saanseoi', 'overture', 'planning'])
    sqlite.query('INSERT INTO snapshots VALUES (?, ?)').run(id, `${id}-lineage`)
  const calls: string[] = []
  const resolve = async (
    _db: unknown,
    type: string,
    args: { domainCode: string; inventory?: string; allInventories?: boolean },
  ) => {
    calls.push(args.domainCode)
    const snapshots = domains[args.domainCode as keyof typeof domains]
    return {
      snapshots: args.allInventories
        ? snapshots
        : selectApiInventory(snapshots, type, args.inventory).snapshots,
    }
  }
  return {
    calls,
    close: () => sqlite.close(),
    search: (
      request: { inventory?: string; domainCode?: string } = {},
      resolver = resolve,
    ) =>
      resolvePublishedSearchScopes(
        createLocalHarbourDb(sqlite),
        { ...divisionSearchIndex, domainCodes: ['planning', 'geographic'] },
        { regionCode: 'hk', apiVersion: 'api-divisions-v0.2', ...request },
        { resolveApiReleaseSetSnapshotsForRequest: resolver as never },
      ),
  }
}

for (const inventory of ['saanseoi', 'overture', 'planning']) {
  test(`search finds ${inventory} without requiring a domain`, async () => {
    const f = fixture()
    try {
      expect((await f.search({ inventory })).map(scope => scope.snapshotId)).toEqual([
        inventory,
      ])
      expect(f.calls).toEqual(['planning', 'geographic'])
    } finally {
      f.close()
    }
  })
}

test('unknown inventories and explicitly incompatible domains remain unavailable', async () => {
  const f = fixture()
  try {
    await expect(f.search({ inventory: 'unknown' })).rejects.toBeInstanceOf(
      InventorySelectionError,
    )
    await expect(
      f.search({ inventory: 'overture', domainCode: 'planning' }),
    ).rejects.toBeInstanceOf(InventorySelectionError)
  } finally {
    f.close()
  }
})

test('unfiltered search retains every domain and unexpected selection failures propagate', async () => {
  const f = fixture()
  try {
    expect((await f.search()).map(scope => scope.snapshotId)).toEqual([
      'planning',
      'saanseoi',
    ])
    await expect(
      f.search({ inventory: 'saanseoi' }, async () => {
        throw new Error('database unavailable')
      }),
    ).rejects.toThrow('database unavailable')
  } finally {
    f.close()
  }
})
