import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { currentSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../testing/metaFixtures'
import {
  deleteStaleDivisionCurrentRows,
  replaceDivisionCurrentI18n,
  upsertDivisionCurrentStates,
  type DivisionBaseRecord,
  type DivisionI18nRecord,
} from './division'

test('Division current writes insert, change and remove only the affected rows within a stable scope', async () => {
  const client = new Database(':memory:')
  client.exec(
    loadMigrationSql(join(import.meta.dir, '../../../../db/migrations'), ['current']),
  )
  client.exec('PRAGMA foreign_keys=ON')
  const db = drizzle({ client, schema: currentSchema })
  const scope = 'lineage'
  const timestamp = '2025-01-01T00:00:00Z'
  const base = (id: string): DivisionBaseRecord => ({
    id,
    class: 'district',
    level: 2,
    category: 'administrative',
    hierarchies: { full: [] },
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const locale = (divisionId: string, language: string): DivisionI18nRecord => ({
    divisionId,
    locale: language,
    name: `${divisionId}-${language}`,
    isLocaleInferred: false,
    nameProvenance: 'provided',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const changes = () =>
    (client.query('SELECT total_changes() AS count').get() as { count: number }).count
  const write = async (rows: DivisionBaseRecord[], localised: DivisionI18nRecord[]) => {
    const before = changes()
    await upsertDivisionCurrentStates(db as never, scope, rows)
    await replaceDivisionCurrentI18n(
      db as never,
      scope,
      rows.map(row => row.id),
      localised,
    )
    return changes() - before
  }
  try {
    const rows = [base('a'), base('b')]
    const localised = [locale('a', 'en'), locale('a', 'zh-hant'), locale('b', 'en')]
    expect(await write(rows, localised)).toBe(5)
    const reissue = '2026-01-01T00:00:00Z'
    expect(
      await write(
        rows.map(row => ({ ...row, createdAt: reissue, updatedAt: reissue })),
        localised.map(row => ({ ...row, createdAt: reissue, updatedAt: reissue })),
      ),
    ).toBe(0)
    expect(
      await write(
        [
          {
            ...rows[0]!,
            divisionCode: 'revised-code',
            class: 'city',
            category: 'locality',
            updatedAt: reissue,
          },
          rows[1]!,
        ],
        [
          localised[0]!,
          { ...localised[1]!, name: 'Revised name', updatedAt: reissue },
          localised[2]!,
        ],
      ),
    ).toBe(2)
    expect(
      client
        .query(
          'SELECT class,category,divisionCode,createdAt,updatedAt FROM divisions WHERE id=?',
        )
        .get('a'),
    ).toEqual({
      class: 'city',
      category: 'locality',
      divisionCode: 'revised-code',
      createdAt: timestamp,
      updatedAt: reissue,
    })
    const beforeLocaleRemoval = changes()
    await replaceDivisionCurrentI18n(db as never, scope, ['a'], [localised[0]!])
    expect(changes() - beforeLocaleRemoval).toBe(1)
    const beforeRemoval = changes()
    expect(
      await deleteStaleDivisionCurrentRows(db as never, scope, new Set(['a'])),
    ).toBe(1)
    expect(changes() - beforeRemoval).toBe(2)
    expect(client.query('SELECT DISTINCT snapshotId FROM divisions').all()).toEqual([
      { snapshotId: scope },
    ])
    expect(client.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    client.close()
  }
})
