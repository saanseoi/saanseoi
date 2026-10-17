import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backfillI18nMeta } from './backfill-i18n-meta'

test('backfill preserves effective provenance, hashes and NULLs, supports recovery and is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-meta-'))
  const path = join(dir, 'local.sqlite')
  const db = new Database(path)
  try {
    db.exec(
      'CREATE TABLE names (id TEXT PRIMARY KEY, locale TEXT, meta TEXT, versionHash TEXT); CREATE TABLE datasets(id TEXT PRIMARY KEY, i18n TEXT);',
    )
    const values = [
      null,
      {},
      { isLocaleInferred: false },
      { isLocaleInferred: true },
      {
        isLocaleInferred: false,
        fields: {
          name: {
            origin: 'human-translated',
            isHumanVerified: false,
            translatorId: 'translator',
          },
        },
      },
    ]
    values.forEach((meta, i) => {
      db.query('INSERT INTO names VALUES (?,?,?,?)').run(
        String(i),
        'en',
        meta === null ? null : JSON.stringify(meta),
        `hash-${i}`,
      )
    })
    db.query('INSERT INTO datasets VALUES (?,?)').run(
      'dataset',
      JSON.stringify({
        en: { name: 'Name', meta: { isLocaleInferred: false } },
        'zh-hant': { name: '名稱', meta: { isLocaleInferred: true } },
      }),
    )
    const shards = [{ binding: 'DB_META', path }]
    const dry = backfillI18nMeta(shards, join(dir, 'dry'))
    expect(
      dry.shards[0]!.tables.reduce((n: number, t: any) => n + t.changedRows, 0),
    ).toBe(4)
    expect(db.query("SELECT meta FROM names WHERE id='2'").get()).toEqual({
      meta: '{"isLocaleInferred":false}',
    })
    backfillI18nMeta(shards, join(dir, 'apply'), true)
    expect(db.query('SELECT meta FROM names ORDER BY id').all()).toEqual([
      { meta: null },
      { meta: null },
      { meta: null },
      { meta: '{"isLocaleInferred":true}' },
      {
        meta: '{"fields":{"name":{"origin":"human-translated","isHumanVerified":false,"translatorId":"translator"}}}',
      },
    ])
    expect(db.query('SELECT versionHash FROM names ORDER BY id').all()).toEqual(
      values.map((_, i) => ({ versionHash: `hash-${i}` })),
    )
    expect(
      JSON.parse((db.query('SELECT i18n FROM datasets').get() as any).i18n),
    ).toEqual({
      en: { name: 'Name', meta: null },
      'zh-hant': { name: '名稱', meta: { isLocaleInferred: true } },
    })
    const repeat = backfillI18nMeta(shards, join(dir, 'repeat'), true)
    expect(repeat.shards[0]!.tables.every((t: any) => t.changedRows === 0)).toBe(true)
    db.exec(readFileSync(join(dir, 'apply', '0-rollback.sql'), 'utf8'))
    expect(db.query("SELECT meta FROM names WHERE id='2'").get()).toEqual({
      meta: '{"isLocaleInferred":false}',
    })
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
