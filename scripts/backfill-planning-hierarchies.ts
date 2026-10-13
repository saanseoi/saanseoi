import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validatePlanningHierarchy } from '../apps/harbour-cli/src/lib/pipeline/divisions/planningHierarchy'
import { buildDivisionBaseHashInput } from '../libs/core/src/pipeline/services/divisions/division'
import { createHash } from '../libs/core/src/pipeline/utils'

type Row = Record<string, any>
const levels = ['ppu', 'spu', 'tpu', 'subunit']
const decode = (row: Row) => {
  const value = { ...row }
  for (const key of [
    'identifiers',
    'hierarchies',
    'sources',
    'geometry',
    'bbox',
    'cartography',
  ])
    if (typeof value[key] === 'string') value[key] = JSON.parse(value[key])
  return value
}
const identity = (row: Row) => {
  const i = levels.indexOf(row.class.replace('planning-', ''))
  if (i < 0) throw Error(`Unexpected Planning class ${row.class}`)
  const codes = row.identifiers['hkgov-pland']
  return JSON.stringify([
    levels[i],
    ...levels.slice(0, i + 1).map(k => {
      if (codes[k] == null) throw Error(`Missing ${k} for ${row.id}`)
      return String(codes[k])
    }),
  ])
}
const key = (row: Row) => JSON.stringify([row.id, row.snapshotId])

function checkExistingPath(existing: Row, expected: Row, id: string) {
  if (Object.keys(existing).some(k => k !== 'full') || !Array.isArray(existing.full))
    throw Error(`Unexpected hierarchy domains for ${id}`)
  const path = expected.full[0] ?? []
  for (const branch of existing.full) {
    if (!Array.isArray(branch)) throw Error(`Invalid hierarchy branch for ${id}`)
    let previous = -1
    for (const entry of branch) {
      const index = path.findIndex(
        (p: Row) => JSON.stringify(p) === JSON.stringify(entry),
      )
      if (index <= previous) throw Error(`Conflicting retained ancestor for ${id}`)
      previous = index
    }
  }
}

/** Reconstruct only source-pinned Planning paths; dry-run unless explicitly applied. */
export async function backfillPlanningHierarchies(options: {
  meta: string
  history: string
  source: string
  current: string
  output: string
  apply?: boolean
}) {
  for (const path of [options.meta, options.history, options.source, options.current])
    if (!existsSync(path)) throw Error(`Missing database ${path}`)
  mkdirSync(options.output, { recursive: true })
  const meta = new Database(options.meta, { readonly: true })
  const source = new Database(options.source, { readonly: true })
  const db = new Database(':memory:')
  db.query('ATTACH DATABASE ? AS history').run(resolve(options.history))
  db.query('ATTACH DATABASE ? AS current').run(resolve(options.current))
  const versions = () => [
    meta.query('PRAGMA data_version').get(),
    source.query('PRAGMA data_version').get(),
    db.query('PRAGMA history.data_version').get(),
    db.query('PRAGMA current.data_version').get(),
  ]
  const beforeVersions = JSON.stringify(versions())
  try {
    const snapshots = meta
      .query(
        "SELECT s.* FROM snapshots s JOIN snapshotLineages sl ON sl.id=s.snapshotLineageId WHERE s.code LIKE 'ss-hk-division-hkgov-pland-pu-%' AND sl.resourceType='division' ORDER BY s.cohortKey",
      )
      .all() as Row[]
    if (!snapshots.length) throw Error('No Planning snapshots')
    const historical = db
      .query(
        "SELECT rowid AS repairRowid,* FROM history.divisions WHERE class IN ('planning-ppu','planning-spu','planning-tpu','planning-subunit')",
      )
      .all() as Row[]
    const byVersion = new Map(historical.map(row => [key(row), decode(row)]))
    const paths = new Map<string, any>()
    const inventories = new Map<string, Map<string, Row>>()
    const snapshotReport: Row[] = []
    for (const snapshot of snapshots) {
      const plan: Row[] = []
      let step: Row | null = snapshot
      while (step) {
        if (plan.some(s => s.id === step!.id)) throw Error('Cyclic snapshot ancestry')
        plan.unshift(step)
        step = step.parentSnapshotId
          ? (meta
              .query('SELECT * FROM snapshots WHERE id=?')
              .get(step.parentSnapshotId) as Row)
          : null
      }
      const inventory = new Map<string, Row>()
      for (const ancestor of plan)
        for (const change of db
          .query(
            "SELECT * FROM history.historyEvents WHERE snapshotId=? AND recordType='division'",
          )
          .all(ancestor.id) as Row[]) {
          if (change.operation === 'delete') inventory.delete(change.recordId)
          else {
            const row = byVersion.get(
              JSON.stringify([change.recordId, change.snapshotId]),
            )
            if (!row)
              throw Error(
                `Missing Planning replay version ${change.recordId}/${change.versionHash}`,
              )
            inventory.set(row.id, row)
          }
        }
      const index = new Map<string, Row>()
      for (const row of inventory.values()) {
        const id = identity(row)
        if (index.has(id)) throw Error(`Ambiguous Planning identity ${id}`)
        index.set(id, row)
      }
      const pins = new Set(
        (
          meta
            .query(
              'SELECT resourceReleaseId FROM snapshotResourceReleases WHERE snapshotId=?',
            )
            .all(snapshot.id) as Row[]
        ).map(r => r.resourceReleaseId),
      )
      const covered = new Set<string>()
      let omissions = 0
      for (const resolution of db
        .query('SELECT * FROM history.sourceResolutions WHERE snapshotId=?')
        .all(snapshot.id) as Row[]) {
        const evidence = JSON.parse(resolution.resolutions)
        if (evidence.decisions?.some((d: Row) => d.type === 'source_omission')) {
          if (Object.keys(evidence.entities).length) throw Error('Conflicting omission')
          omissions++
          continue
        }
        if (
          !pins.has(resolution.sourceReleaseId) ||
          resolution.scopeId !== `snapshot:${snapshot.id}`
        )
          throw Error('Unpinned evidence')
        const native = source
          .query(
            'SELECT properties FROM hkgovPlandPlanningCells WHERE sourceRecordId=? AND versionHash=?',
          )
          .get(resolution.sourceRecordId, resolution.sourceVersionHash) as Row
        if (!native) throw Error('Missing exact retained publisher assertion')
        const props = JSON.parse(native.properties)
        const codes = [
          props.ppu,
          props.spu,
          props.tpu,
          props.subunit ?? props.sbVc,
        ].map(String)
        for (const [i, level] of levels.entries()) {
          const row = index.get(JSON.stringify([level, ...codes.slice(0, i + 1)]))
          if (!row || !evidence.entities.division?.includes(row.id))
            throw Error('Source resolution does not evidence the canonical ancestry')
          covered.add(row.id)
        }
      }
      if (covered.size !== inventory.size) throw Error('Unevidenced Planning inventory')
      for (const row of inventory.values()) {
        const i = levels.indexOf(row.class.replace('planning-', ''))
        const codes = row.identifiers['hkgov-pland']
        const parents = levels.slice(0, i).map((level, j) => {
          const parent = index.get(
            JSON.stringify([
              level,
              ...levels.slice(0, j + 1).map(k => String(codes[k])),
            ]),
          )
          if (!parent) throw Error(`Missing ${level} for ${row.id}`)
          return parent
        })
        validatePlanningHierarchy(row as any, parents as any)
        const hierarchy = {
          full: parents.length
            ? [parents.map(p => ({ id: p.id, name: null, class: p.class }))]
            : [],
        }
        const previous = paths.get(key(row))
        if (previous && JSON.stringify(previous) !== JSON.stringify(hierarchy))
          throw Error('Conflicting replay ancestry')
        paths.set(key(row), hierarchy)
      }
      inventories.set(snapshot.id, inventory)
      snapshotReport.push({
        snapshotId: snapshot.id,
        code: snapshot.code,
        divisions: inventory.size,
        omissionsPreserved: omissions,
      })
    }
    const changes: Row[] = []
    const repairedVersions = new Set<string>()
    for (const raw of historical) {
      const hierarchy = paths.get(key(raw))
      if (!hierarchy) throw Error(`Unreplayed Planning version ${raw.id}`)
      checkExistingPath(JSON.parse(raw.hierarchies), hierarchy, raw.id)
      if (JSON.stringify(JSON.parse(raw.hierarchies)) === JSON.stringify(hierarchy))
        continue
      const row = decode(raw)
      if (
        (await createHash(buildDivisionBaseHashInput(row as any))) !== raw.versionHash
      )
        throw Error(`Unexpected content hash contract for ${raw.id}`)
      const hash = await createHash(
        buildDivisionBaseHashInput({ ...row, hierarchies: hierarchy } as any),
      )
      const repairedKey = JSON.stringify([raw.id, raw.snapshotId])
      if (repairedVersions.has(repairedKey)) throw Error('Planned version collision')
      repairedVersions.add(repairedKey)
      changes.push({
        database: 'history',
        rowid: raw.repairRowid,
        id: raw.id,
        old: raw.hierarchies,
        hierarchy: JSON.stringify(hierarchy),
        oldHash: raw.versionHash,
        hash,
      })
    }
    // Public current rows must match an evidenced latest Planning inventory by ID and codes.
    const latest = inventories.get(snapshots.at(-1)!.id)!
    for (const raw of db
      .query(
        "SELECT rowid AS repairRowid,* FROM current.divisions WHERE class IN ('planning-ppu','planning-spu','planning-tpu','planning-subunit')",
      )
      .all() as Row[]) {
      const row = decode(raw),
        retained = latest.get(raw.id)
      if (!retained || identity(retained) !== identity(row))
        throw Error(
          `Current Planning identity absent from latest retained inventory: ${raw.id}`,
        )
      const hierarchy = JSON.stringify(paths.get(key(retained)))
      checkExistingPath(row.hierarchies, JSON.parse(hierarchy), raw.id)
      if (JSON.stringify(row.hierarchies) !== hierarchy)
        changes.push({
          database: 'current',
          rowid: raw.repairRowid,
          id: raw.id,
          old: raw.hierarchies,
          hierarchy,
        })
    }
    const receipt = {
      applied: false,
      paths: options,
      changed: changes.length,
      history: changes.filter(c => c.database === 'history').length,
      current: changes.filter(c => c.database === 'current').length,
      snapshots: snapshotReport,
      replayReferences: 0,
      quickCheck: {} as Row,
    }
    const save = () =>
      writeFileSync(
        resolve(options.output, 'plan.json'),
        JSON.stringify({ ...receipt, changes }, null, 2),
      )
    save()
    if (options.apply && changes.length) {
      const backup = resolve(options.output, 'rollback.sqlite')
      if (existsSync(backup)) throw Error('Rollback backup already exists')
      db.query('ATTACH DATABASE ? AS repairBackup').run(backup)
      db.exec('BEGIN IMMEDIATE')
      try {
        if (beforeVersions !== JSON.stringify(versions()))
          throw Error('Concurrent database change')
        for (const name of ['history', 'current'])
          db.exec(
            `CREATE TABLE repairBackup.${name}_divisions AS SELECT rowid AS repairRowid,* FROM ${name}.divisions WHERE 0`,
          )
        for (const c of changes) {
          db.query(
            `INSERT INTO repairBackup.${c.database}_divisions SELECT rowid,* FROM ${c.database}.divisions WHERE rowid=?`,
          ).run(c.rowid)
          if (c.hash) {
            const updated = db
              .query(
                'UPDATE history.divisions SET hierarchies=?,versionHash=? WHERE rowid=? AND hierarchies=? AND versionHash=?',
              )
              .run(c.hierarchy, c.hash, c.rowid, c.old, c.oldHash)
            if (updated.changes !== 1) throw Error('Concurrent history row change')
          } else if (
            db
              .query(
                'UPDATE current.divisions SET hierarchies=? WHERE rowid=? AND hierarchies=?',
              )
              .run(c.hierarchy, c.rowid, c.old).changes !== 1
          )
            throw Error('Concurrent current row change')
        }
        // The publisher and snapshot plan must remain unchanged throughout reconstruction.
        const now = versions()
        if (
          JSON.stringify(now.slice(0, 2)) !==
          JSON.stringify(JSON.parse(beforeVersions).slice(0, 2))
        )
          throw Error('Concurrent evidence change')
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      const rollback = ['BEGIN IMMEDIATE;']
      for (const name of ['history', 'current']) {
        const columns = (
          db.query(`PRAGMA ${name}.table_info(divisions)`).all() as Row[]
        ).map(r => r.name)
        const assignments = columns.map(column => `"${column}"=b."${column}"`).join(',')
        rollback.push(
          `UPDATE ${name}.divisions AS d SET ${assignments} FROM repairBackup.${name}_divisions AS b WHERE d.rowid=b.repairRowid;`,
        )
      }
      rollback.push('COMMIT;')
      writeFileSync(resolve(options.output, 'rollback.sql'), rollback.join('\n'))
      receipt.applied = true
      for (const name of ['history', 'current'])
        receipt.quickCheck[name] = db.query(`PRAGMA ${name}.quick_check`).all()
      save()
    }
    return receipt
  } finally {
    db.close()
    meta.close()
    source.close()
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2),
    options: Row = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true
    else if (
      ['--meta', '--history', '--source', '--current', '--output'].includes(args[i]!)
    )
      options[args[i]!.slice(2)] = args[++i]
    else throw Error(`Unknown argument ${args[i]}`)
  }
  for (const name of ['meta', 'history', 'source', 'current', 'output'])
    if (!options[name]) throw Error(`Missing --${name}`)
  console.log(
    JSON.stringify(await backfillPlanningHierarchies(options as any), null, 2),
  )
}
