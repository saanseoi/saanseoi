import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  planAddressContentMigration,
  applyAddressContentMigration,
} from './migrate-address-content'
import { createHash } from '../libs/core/src/pipeline/utils'
import { buildAddressBaseHashInput } from '../libs/core/src/pipeline/services/addresses/normalisation'

for (const baseline of ['published', 'pending'] as const)
  for (const family of ['current', 'history'] as const)
    test(`${baseline} ${family}: archive parent evidence, remove entity fields and preserve publication identities`, async () => {
      const db = new Database(':memory:')
      const dir = mkdtempSync(join(tmpdir(), 'address-content-'))
      try {
        const root = resolve(import.meta.dir, `../libs/db/migrations/${family}`)
        for (const name of readdirSync(root)
          .sort()
          .filter(
            name =>
              name < (baseline === 'published' ? '20261022022400' : '20261022100419'),
          )) {
          try {
            db.exec(readFileSync(join(root, name, 'migration.sql'), 'utf8'))
          } catch (error) {
            throw new Error(`Migration ${name}: ${error}`)
          }
        }
        const field = baseline === 'published' ? 'granularity' : 'scope'
        const removed = baseline === 'published' ? '' : ',premisesType,premisesKind'
        const values = baseline === 'published' ? '' : " ,'complex','estate'"
        if (family === 'current') {
          db.exec(
            `INSERT INTO address2d(scopeId,divisionSnapshotId,id,${field},parentAddressId${removed}) VALUES ('publication','division','a','building','estate'${values})`,
          )
        } else {
          db.exec(
            `INSERT INTO address2d(snapshotId,id,${field},parentAddressId${removed},versionHash) VALUES ('publication','a','building','estate'${values},'old'),('other-publication','a','building','other-estate'${values},'other-old')`,
          )
          db.exec(
            "INSERT INTO address2d(snapshotId,id,operation) VALUES ('retired-publication','a','delete')",
          )
        }
        const before = db.query('SELECT * FROM address2d').all() as Record<
          string,
          unknown
        >[]
        const plan = await planAddressContentMigration(db, family)
        expect(plan.parentLinks).toBe(family === 'current' ? 1 : 2)
        const tampered = structuredClone(plan)
        tampered.rows[0]!.hash = 'bad'
        await expect(
          applyAddressContentMigration(
            db,
            tampered,
            join(dir, 'bad.sqlite'),
            join(dir, 'bad.json'),
          ),
        ).rejects.toThrow('Stale')
        await applyAddressContentMigration(
          db,
          plan,
          join(dir, 'backup.sqlite'),
          join(dir, 'archive.json'),
        )
        const archive = JSON.parse(readFileSync(join(dir, 'archive.json'), 'utf8'))
        expect(archive.rows.some((row: any) => row.parentAddressId === 'estate')).toBe(
          true,
        )
        expect(archive.curations.length).toBeGreaterThan(0)
        const after = db.query('SELECT * FROM address2d').all() as Record<
          string,
          unknown
        >[]
        expect(after.length).toBe(before.length)
        for (let i = 0; i < after.length; i++) {
          const row = after[i]!,
            original = before[i]!
          for (const field of [
            'id',
            'snapshotId',
            'scopeId',
            'createdAt',
            'operation',
            'isCurrent',
          ])
            expect(row[field]).toEqual(original[field])
          for (const field of ['parentAddressId', 'premisesType', 'premisesKind'])
            expect(row).not.toHaveProperty(field)
          if (family === 'history')
            expect(row.versionHash).toBe(
              row.operation === 'delete'
                ? null
                : await createHash(buildAddressBaseHashInput(row as never)),
            )
        }
        if (family === 'history')
          expect(
            db
              .query(
                "SELECT count(*) AS n FROM historyEvents WHERE recordType='address2d'",
              )
              .get(),
          ).toEqual({ n: 3 })
      } finally {
        db.close()
        rmSync(dir, { recursive: true, force: true })
      }
    })
