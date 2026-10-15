import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { historySchema } from '@repo/db'
import type { DivisionI18nPayload } from '@repo/db/currentSchema'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { SnapshotReplayStep } from '../../lib/db/metaRegistry'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { normaliseCuratedDivision } from '../services/divisions/curatedDivision'
import {
  buildDivisionBaseHashInput,
  normaliseDivisionI18nSnapshotRow,
} from '../services/divisions/division'
import { createHash, stableJsonStringify } from '../utils'
import {
  type DivisionBaseRecord,
  deleteStaleDivisionCurrentRows,
  getDivisionVersionMapForSnapshot,
  insertDivisionVersionRows,
  replaceDivisionCurrentI18n,
  upsertDivisionCurrentStates,
} from './division'
import {
  closeDivisionHistoryComponents,
  type DivisionHistoryShard,
  divisionHistoryKey,
  divisionLocaleContent,
  identifyDivisionHistoryShards,
  loadDivisionHistoryBaseline,
  planDivisionHistoryChanges,
} from './divisionHistory'

const timestamp = '2025-01-01T00:00:00Z'
const updated = '2026-01-01T00:00:00Z'
const step = (
  id: string,
  parent: string | null,
  bindingName: string,
): SnapshotReplayStep => ({
  resourceReleaseId: 'release',
  snapshotId: id,
  parentSnapshotId: parent,
  shards: [{ dataShardId: bindingName, bindingName }],
})
const base = (id = 'a'): DivisionBaseRecord => ({
  id,
  divisionCode: `code-${id}`,
  class: 'district',
  category: 'administrative',
  level: 2,
  hierarchies: { full: [], administrative: [], locality: [], landform: [] },
  geometry: { type: 'Point', coordinates: [114.1, 22.3] },
  cartography: { minZoom: 2 },
  identifiers: { wikidata: { id: 'Q123' } },
  sources: { overture: [{ dataset: 'publisher', sourceVersion: '2025' }] },
  createdAt: timestamp,
  updatedAt: timestamp,
})
const locale = (language: string, id = 'a'): DivisionI18nPayload => ({
  divisionId: id,
  locale: language,
  name: `${id}-${language}`,
  nameAlts: null,
  nameRules: null,
  nameVariant: null,
  meta: { isLocaleInferred: false, fields: { name: { origin: 'provided' } } },
})

function fixture() {
  const clients = new Map<string, Database>()
  const parameters: number[] = []
  for (const name of ['current', 'old', 'new']) {
    const client = new Database(':memory:')
    client.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../db/migrations'), [
        name === 'current' ? 'current' : 'history',
      ]),
    )
    clients.set(name, client)
  }
  const client = (name: string) => {
    const value = clients.get(name)
    if (!value) throw new Error(`Missing test client ${name}`)
    return value
  }
  const db = (name: string) =>
    drizzle({
      client: client(name),
      logger: {
        logQuery(_sql, values) {
          parameters.push(values.length)
        },
      },
    })
  const current = db('current')
  const old = db('old')
  const next = db('new')
  const shards = new Map<string, DivisionHistoryShard>([
    ['old', { bindingName: 'old', db: old as never }],
    ['new', { bindingName: 'new', db: next as never }],
  ])
  const count = (name: string) =>
    Number(
      (client(name).query('SELECT total_changes() AS count').get() as { count: number })
        .count,
    )
  const counts = () =>
    Object.fromEntries([...clients.keys()].map(name => [name, count(name)]))
  const parent = async (plan: SnapshotReplayStep[]) => {
    const rows = await getDivisionVersionMapForSnapshot(current as never, 'scope', {
      buildDivisionBaseHashInput,
      normaliseDivisionI18nSnapshotRow,
    })
    return {
      rows,
      ...(await loadDivisionHistoryBaseline({
        plan,
        shards,
        current: rows,
        baseHashInput: buildDivisionBaseHashInput,
      })),
    }
  }
  const write = async (input: {
    plan: SnapshotReplayStep[]
    snapshotId: string
    binding: 'old' | 'new'
    rows: Array<{ base: DivisionBaseRecord; i18n: DivisionI18nPayload[] }>
  }) => {
    const baseline = await parent(input.plan)
    const active = input.binding === 'old' ? old : next
    const before = counts()
    const seen = new Set<string>()
    for (const row of input.rows) {
      const localised = row.i18n
        .map(normaliseDivisionI18nSnapshotRow)
        .sort((a, b) => a.locale.localeCompare(b.locale))
      const delta = await planDivisionHistoryChanges({
        base: row.base,
        i18n: localised,
        previous: baseline.rows.get(row.base.id),
        components: baseline.components,
        versionHash: await createHash(buildDivisionBaseHashInput(row.base)),
        churnHash: await createHash({
          base: buildDivisionBaseHashInput(row.base),
          i18n: localised,
        }),
      })
      seen.add(row.base.id)
      await closeDivisionHistoryComponents({
        activeDb: active as never,
        snapshotId: input.snapshotId,
        sourceReleaseId: `release-${input.snapshotId}`,
        components: delta.closures,
        timestamp: row.base.updatedAt ?? updated,
      })
      if (delta.currentChanged) {
        if (delta.baseChanged)
          await upsertDivisionCurrentStates(current as never, 'scope', [row.base])
        await replaceDivisionCurrentI18n(
          current as never,
          'scope',
          [row.base.id],
          localised.map(item => ({
            ...item,
            createdAt: row.base.createdAt,
            updatedAt: row.base.updatedAt,
          })),
        )
      }
      await insertDivisionVersionRows(
        active as never,
        {
          resourceReleaseId: `release-${input.snapshotId}`,
          snapshotId: input.snapshotId,
          cohortKey: '2026',
          snapshotLineageId: 'scope',
          parentSnapshotId: input.plan.at(-1)?.snapshotId ?? null,
        },
        delta.baseRows,
        delta.i18nRows,
      )
    }
    await closeDivisionHistoryComponents({
      activeDb: active as never,
      snapshotId: input.snapshotId,
      sourceReleaseId: `release-${input.snapshotId}`,
      timestamp: updated,
      components: [...baseline.components.values()]
        .filter(row => !seen.has(row.recordId))
        .map(row => ({ ...row, omitted: true })),
    })
    await deleteStaleDivisionCurrentRows(current as never, 'scope', seen)
    return Object.fromEntries(
      [...clients.keys()].map(name => [name, count(name) - (before[name] ?? 0)]),
    )
  }
  return {
    current,
    old,
    next,
    shards,
    client,
    parameters,
    parent,
    write,
    counts,
    close: () => {
      for (const value of clients.values()) value.close()
    },
  }
}

test('core Division writes inherit unchanged base/locales and close only changed owning components', async () => {
  const data = fixture()
  try {
    const initial = { base: base(), i18n: [locale('en'), locale('zh-hant')] }
    expect(
      await data.write({
        plan: [],
        snapshotId: 'first',
        binding: 'old',
        rows: [initial],
      }),
    ).toEqual({ current: 3, old: 3, new: 0 })
    const first = [step('first', null, 'old')]
    const baseRow = data
      .client('old')
      .query(
        'SELECT class,category,divisionCode,hierarchies,identifiers FROM divisions',
      )
      .get()
    expect(baseRow).toEqual({
      class: 'district',
      category: 'administrative',
      divisionCode: 'code-a',
      hierarchies: JSON.stringify(initial.base.hierarchies),
      identifiers: JSON.stringify(initial.base.identifiers),
    })
    const reissued = {
      base: {
        ...initial.base,
        createdAt: updated,
        updatedAt: updated,
        sources: { overture: [{ dataset: 'publisher', sourceVersion: '2026' }] },
      },
      i18n: [...initial.i18n].reverse(),
    }
    expect(
      await data.write({
        plan: first,
        snapshotId: 'same',
        binding: 'new',
        rows: [reissued],
      }),
    ).toEqual({ current: 0, old: 0, new: 0 })
    expect(
      data.client('current').query('SELECT updatedAt,sources FROM divisions').get(),
    ).toEqual({ updatedAt: timestamp, sources: JSON.stringify(initial.base.sources) })
    const same = [...first, step('same', 'first', 'new')]
    const translated = {
      ...reissued,
      i18n: [
        locale('zh-hant'),
        {
          ...locale('en'),
          name: 'New English name',
          meta: {
            isLocaleInferred: false,
            fields: { name: { origin: 'human-translated' as const } },
          },
        },
      ],
    }
    expect(
      await data.write({
        plan: same,
        snapshotId: 'translated',
        binding: 'new',
        rows: [translated],
      }),
    ).toEqual({ current: 1, old: 0, new: 1 })
    expect(
      data.client('old').query('SELECT isCurrent,createdAt FROM divisions').get(),
    ).toEqual({ isCurrent: 1, createdAt: timestamp })
    expect(
      data
        .client('old')
        .query('SELECT locale,isCurrent FROM divisionsI18n ORDER BY locale')
        .all(),
    ).toEqual([
      { locale: 'en', isCurrent: 1 },
      { locale: 'zh-hant', isCurrent: 1 },
    ])
    expect(
      data
        .client('new')
        .query(
          "SELECT json_extract(meta, '$.fields.name.origin') AS origin FROM divisionsI18n",
        )
        .get(),
    ).toEqual({ origin: 'human-translated' })
    expect(
      data
        .client('old')
        .query(
          "SELECT count(*) AS count FROM historyEvents WHERE snapshotId <> 'first'",
        )
        .get(),
    ).toEqual({ count: 0 })
    const translatedPlan = [...same, step('translated', 'same', 'new')]
    const revised = {
      ...translated,
      base: {
        ...translated.base,
        createdAt: timestamp,
        identifiers: { publisher: 'revised' },
      },
    }
    expect(
      await data.write({
        plan: translatedPlan,
        snapshotId: 'base-change',
        binding: 'new',
        rows: [revised],
      }),
    ).toEqual({ current: 1, old: 0, new: 1 })
    expect(
      data.client('new').query('SELECT count(*) AS count FROM divisionsI18n').get(),
    ).toEqual({ count: 1 })
    expect(
      data
        .client('new')
        .query("SELECT createdAt FROM divisions WHERE snapshotId='base-change'")
        .get(),
    ).toEqual({ createdAt: updated })
    const revisedPlan = [...translatedPlan, step('base-change', 'translated', 'new')]
    const baseline = await data.parent(revisedPlan)
    expect(baseline.components.get(divisionHistoryKey('a'))?.shard.bindingName).toBe(
      'new',
    )
    expect(
      baseline.components.get(divisionHistoryKey('a', 'en'))?.shard.bindingName,
    ).toBe('new')
    expect(
      baseline.components.get(divisionHistoryKey('a', 'zh-hant'))?.shard.bindingName,
    ).toBe('old')
    expect(
      await data.write({
        plan: revisedPlan,
        snapshotId: 'source-change',
        binding: 'new',
        rows: [revised],
      }),
    ).toEqual({ current: 0, old: 0, new: 0 })
    expect(Math.max(...data.parameters)).toBeLessThanOrEqual(100)
  } finally {
    data.close()
  }
})

test('locale/base omissions are sparse and reappearance preserves original component provenance', async () => {
  const data = fixture()
  try {
    const row = { base: base(), i18n: [locale('en'), locale('zh-hant')] }
    await data.write({
      plan: [],
      snapshotId: 'first',
      binding: 'new',
      rows: [row],
    })
    const first = [step('first', null, 'new')]
    const kept = { base: { ...row.base, updatedAt: updated }, i18n: [locale('en')] }
    expect(
      await data.write({
        plan: first,
        snapshotId: 'locale-removed',
        binding: 'new',
        rows: [kept],
      }),
    ).toEqual({ current: 1, old: 0, new: 1 })
    const removed = [...first, step('locale-removed', 'first', 'new')]
    expect(
      await data.write({
        plan: removed,
        snapshotId: 'still-absent',
        binding: 'new',
        rows: [kept],
      }),
    ).toEqual({ current: 0, old: 0, new: 0 })
    const absent = [...removed, step('still-absent', 'locale-removed', 'new')]
    expect(
      await data.write({
        plan: absent,
        snapshotId: 'empty',
        binding: 'new',
        rows: [],
      }),
    ).toEqual({ current: 2, old: 0, new: 2 })
    const empty = [...absent, step('empty', 'still-absent', 'new')]
    expect(
      await data.write({
        plan: empty,
        snapshotId: 'reappeared',
        binding: 'new',
        rows: [{ ...row, base: { ...row.base, updatedAt: updated } }],
      }),
    ).toEqual({ current: 3, old: 0, new: 3 })
    expect(
      data.client('new').query('SELECT snapshotId,isCurrent FROM divisions').get(),
    ).toEqual({ snapshotId: 'first', isCurrent: 1 })
    expect(
      data
        .client('new')
        .query(
          "SELECT snapshotId,isCurrent FROM divisionsI18n WHERE snapshotId='first'",
        )
        .all(),
    ).toEqual([
      { snapshotId: 'first', isCurrent: 1 },
      { snapshotId: 'first', isCurrent: 1 },
    ])
    const final = await data.parent([...empty, step('reappeared', 'empty', 'new')])
    expect(final.components.size).toBe(3)
    expect([...final.components.values()].map(row => row.snapshotId)).toEqual([
      'reappeared',
      'reappeared',
      'reappeared',
    ])
  } finally {
    data.close()
  }
})

test('parent replay rejects unavailable content, ambiguous journals, and incomplete named source-only ancestry', async () => {
  const data = fixture()
  try {
    const firstStep = step('first', null, 'old')
    const sourceStep = step('source-only', 'first', 'new')
    const plan = [firstStep, sourceStep]
    await expect(
      identifyDivisionHistoryShards(plan, [data.old as never, data.next as never]),
    ).rejects.toThrow('explicit binding names')
    await expect(
      identifyDivisionHistoryShards(
        plan,
        [],
        [{ bindingName: 'old', db: data.old as never }],
      ),
    ).rejects.toThrow('Missing Division history binding new')
    const named = await identifyDivisionHistoryShards(
      plan,
      [],
      [...data.shards.values()].reverse(),
    )
    expect(named.get('old')?.db === data.shards.get('old')?.db).toBe(true)
    expect(
      (await identifyDivisionHistoryShards([firstStep], [data.old as never])).get('old')
        ?.db === data.shards.get('old')?.db,
    ).toBe(true)
    const row = { base: base(), i18n: [locale('en')] }
    await data.write({
      plan: [],
      snapshotId: 'first',
      binding: 'old',
      rows: [row],
    })
    await data.next
      .insert(historySchema.divisions)
      .values({
        ...row.base,
        snapshotId: 'first',
        id: 'a',
        versionHash: 'ambiguous',
        operation: 'upsert',
      })
      .run()
    await expect(
      data.parent([
        { ...firstStep, shards: [...firstStep.shards, ...sourceStep.shards] },
      ]),
    ).rejects.toThrow('multiple owners')
    data.client('new').exec("DELETE FROM divisions WHERE snapshotId='first'")
    data
      .client('old')
      .exec(
        'PRAGMA ignore_check_constraints=ON; UPDATE divisionsI18n SET versionHash=NULL',
      )
    await expect(data.parent(plan)).rejects.toThrow('invalid content event')
  } finally {
    data.close()
  }
})

test('bounded exact closures leave unrelated branches and locale components untouched', async () => {
  const data = fixture()
  try {
    const rows = Array.from({ length: 105 }, (_, i) => ({
      base: base(`division-${i}`),
      i18n: [locale('en', `division-${i}`), locale('zh-hant', `division-${i}`)],
    }))
    await data.write({ plan: [], snapshotId: 'first', binding: 'old', rows })
    const baseline = await data.parent([step('first', null, 'old')])
    const unrelated = {
      ...base('division-0'),
      class: 'city',
      versionHash: 'unrelated',

      snapshotId: 'another-branch',
      isCurrent: true,
    }
    await data.old.insert(historySchema.divisions).values(unrelated).run()
    const before = data.counts()
    await closeDivisionHistoryComponents({
      activeDb: data.next as never,
      snapshotId: 'closed',
      sourceReleaseId: 'closed-release',
      timestamp: updated,
      components: [...baseline.components.values()]
        .filter(row => row.recordType === 'division')
        .map(row => ({ ...row, omitted: true })),
    })
    expect((data.counts().old ?? 0) - (before.old ?? 0)).toBe(0)
    expect((data.counts().new ?? 0) - (before.new ?? 0)).toBe(105)
    expect(
      data
        .client('old')
        .query("SELECT isCurrent FROM divisions WHERE versionHash='unrelated'")
        .get(),
    ).toEqual({ isCurrent: 1 })
    expect(
      data
        .client('old')
        .query('SELECT count(*) AS count FROM divisionsI18n WHERE isCurrent=1')
        .get(),
    ).toEqual({ count: 210 })
    expect(
      data.client('new').query('SELECT count(*) AS count FROM historyEvents').get(),
    ).toEqual({ count: 105 })
    expect(Math.max(...data.parameters)).toBeLessThanOrEqual(100)
  } finally {
    data.close()
  }
})

test('locale content identity includes name provenance independently of base fields', async () => {
  const provided = locale('en')
  expect(await createHash(divisionLocaleContent(provided))).not.toBe(
    await createHash(
      divisionLocaleContent({
        ...provided,
        meta: {
          isLocaleInferred: false,
          fields: { name: { origin: 'human-translated' } },
        },
      }),
    ),
  )
  expect(buildDivisionBaseHashInput(base())).toEqual(
    buildDivisionBaseHashInput({
      ...base(),
      sources: { overture: [{ dataset: 'publisher', sourceVersion: '2026' }] },
      updatedAt: updated,
    }),
  )
})

test('geometry fingerprints do not write Division versions or current rows', async () => {
  const data = fixture()
  const raw = (ancestor: string) => ({
    id: 'a',
    record: {
      id: 'a',
      class: 'village',
      names: { en: { name: 'Village' } },
      hierarchies: {
        full: [
          [
            {
              id: 'parent',
              class: 'district',
              name: 'Parent',
              fullContainment: true,
              containmentGeometry: { division: 'sha256:child', ancestor },
            },
          ],
        ],
      },
    },
  })
  const record = (ancestor: string) => {
    const value = normaliseCuratedDivision(raw(ancestor))
    return { base: value.base, i18n: value.i18n }
  }
  try {
    await data.write({
      plan: [],
      snapshotId: 'first',
      binding: 'old',
      rows: [record('sha256:old')],
    })
    const first = [step('first', null, 'old')]
    expect(
      await data.write({
        plan: first,
        snapshotId: 'next',
        binding: 'new',
        rows: [record('sha256:new')],
      }),
    ).toEqual({ current: 0, old: 0, new: 0 })
    expect(data.client('new').query('SELECT * FROM divisions').all()).toHaveLength(0)
    expect(data.client('new').query('SELECT * FROM historyEvents').all()).toHaveLength(
      0,
    )
    expect(
      JSON.stringify(
        data.client('old').query('SELECT hierarchies FROM divisions').get(),
      ),
    ).not.toContain('containment_geometry')
    expect(
      await data.write({
        plan: [...first, step('next', 'first', 'new')],
        snapshotId: 'same',
        binding: 'new',
        rows: [record('sha256:new')],
      }),
    ).toEqual({ current: 0, old: 0, new: 0 })
  } finally {
    data.close()
  }
})

test('locale identity retains translator and verification changes with unchanged text', () => {
  const row = {
    divisionId: 'metadata-only',
    locale: 'de',
    name: 'Name',
    nameAlts: null,
    nameVariant: null,
    nameRules: null,
    meta: {
      isLocaleInferred: false,
      fields: {
        name: { origin: 'ai-translated' as const, translatorId: 'translator-a' },
      },
    },
  }
  const before = stableJsonStringify(divisionLocaleContent(row))
  expect(
    stableJsonStringify(
      divisionLocaleContent({
        ...row,
        meta: {
          ...row.meta,
          fields: { name: { ...row.meta.fields.name, isHumanVerified: true } },
        },
      }),
    ),
  ).not.toBe(before)
  expect(
    stableJsonStringify(
      divisionLocaleContent({
        ...row,
        meta: {
          ...row.meta,
          fields: { name: { ...row.meta.fields.name, translatorId: 'translator-b' } },
        },
      }),
    ),
  ).not.toBe(before)
  expect(
    stableJsonStringify(
      divisionLocaleContent({
        ...row,
        meta: {
          fields: row.meta.fields,
          isLocaleInferred: false,
        },
      }),
    ),
  ).toBe(before)
})
