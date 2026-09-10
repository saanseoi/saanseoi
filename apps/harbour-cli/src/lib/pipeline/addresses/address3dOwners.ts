type OwnerReference = { address2dId: string; unresolvedSectionIds: string[] }
type Requirement = { id: string; parent?: string }
type ReadCurrent = (
  target: 'current',
  statements: Array<{ sql: string; params: unknown[] }>,
) => Promise<Record<string, unknown>[]>

// Reserve one of D1's 100 parameters for the selected snapshot.
const REFERENCES_PER_QUERY = 99

/** Stream a bounded preflight; a section must have exactly its reviewed owner. */
export async function validateAddress3dOwners(
  snapshotId: string,
  collections: AsyncIterable<OwnerReference>,
  execute: ReadCurrent,
) {
  let pending: Requirement[] = []
  const flush = async () => {
    if (!pending.length) return
    const ids = [...new Set(pending.map(requirement => requirement.id))]
    const rows = await execute('current', [
      {
        sql: `SELECT id,parentAddressId FROM address2d WHERE snapshotId = ? AND id IN (${ids.map(() => '?').join(',')});`,
        params: [snapshotId, ...ids],
      },
    ])
    const byId = new Map<string, Record<string, unknown>[]>()
    for (const row of rows) {
      if (typeof row.id !== 'string') throw new Error('Invalid Address2D lookup result')
      const matches = byId.get(row.id) ?? []
      matches.push(row)
      byId.set(row.id, matches)
    }
    for (const requirement of pending) {
      const matches = byId.get(requirement.id) ?? []
      if (requirement.parent === undefined) {
        if (matches.length !== 1)
          throw new Error(
            `Address3D owner ${requirement.id} is absent from the selected snapshot`,
          )
      } else if (
        matches.filter(row => row.parentAddressId === requirement.parent).length !== 1
      ) {
        throw new Error(
          `Address3D section ${requirement.id} has no reviewed parent relationship`,
        )
      }
    }
    pending = []
  }
  const append = async (requirement: Requirement) => {
    pending.push(requirement)
    if (pending.length === REFERENCES_PER_QUERY) await flush()
  }
  for await (const collection of collections) {
    await append({ id: collection.address2dId })
    for (const id of collection.unresolvedSectionIds) {
      await append({ id, parent: collection.address2dId })
    }
  }
  await flush()
}
