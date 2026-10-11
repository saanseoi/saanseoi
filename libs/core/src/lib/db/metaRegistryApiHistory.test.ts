import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { getRegistryApi } from './metaRegistry'

test('family release history spans API contracts and retains the selected contract content', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), ['meta']),
    )
    sqlite.exec(`
      INSERT INTO apiVersions(id,code,familyType,version,status,versionHash) VALUES
        ('v2','api-divisions-v0.2','divisions','0.2','current','test'),
        ('v1','api-divisions-v0.1','divisions','0.1','deprecated','test'),
        ('places','api-places-v0.1','places','0.1','current','test');
      INSERT INTO apiReleaseSets(id,code,regionCode,domainCode,cohortKey,revision,schemaVersion,rulesetVersion,versionHash) VALUES
        ('old','data-hk-divisions-2026-08-19.0-r0','hk','geographic','2026-08-19.0',0,'sv-division-v1','rs-division-merge-v1','test'),
        ('new','data-hk-divisions-2026-10-01.0','hk','geographic','2026-10-01.0',0,'sv-division-v1','rs-division-merge-v2','test'),
        ('place','data-hk-places-2026-10-01.0','hk','geographic','2026-10-01.0',0,'sv-place-v1','rs-place-v1','test');
      INSERT INTO apiVersionReleaseSets(id,apiVersionId,apiReleaseSetId,status,notes,guide,versionHash) VALUES
        ('old-v1','v1','old','archived','{"en":"Overture notes"}','{"en":"Overture guide"}','test'),
        ('new-v1','v1','new','archived','{"en":"Shared v1 notes"}','{"en":"Shared v1 guide"}','test'),
        ('new-v2','v2','new','current','{"en":"SaanSeoi notes"}','{"en":"SaanSeoi guide"}','test'),
        ('place-version','places','place','current','{}','{}','test');
    `)
    const db = createLocalHarbourDb(sqlite)
    const current = await getRegistryApi(db as never, 'divisions', {
      releaseCode: 'data-hk-divisions-2026-10-01.0',
    })
    expect(current?.id).toBe('v2')
    expect(current?.releases.map(release => release.id)).toEqual(['new', 'old'])
    expect(current?.releases[0]?.notes).toBe(JSON.stringify({ en: 'SaanSeoi notes' }))
    expect(current?.releases[1]?.displayStatus).toBe('superseded')

    const historical = await getRegistryApi(db as never, 'divisions', {
      releaseCode: 'data-hk-divisions-2026-08-19.0-r0',
    })
    expect(historical?.id).toBe('v1')
    expect(historical?.releases.map(release => release.id)).toEqual(['new', 'old'])
    expect(historical?.releases[1]?.guide).toBe(
      JSON.stringify({ en: 'Overture guide' }),
    )
    expect(historical?.releases[1]?.notes).toBe(
      JSON.stringify({ en: 'Overture notes' }),
    )
    expect(historical?.releases[1]?.apiVersion).toBe('api-divisions-v0.1')

    const explicit = await getRegistryApi(db as never, 'api-divisions-v0.1')
    expect(explicit?.id).toBe('v1')
    expect(explicit?.releases).toHaveLength(2)
    expect(explicit?.releases.every(release => release.apiVersionId === 'v1')).toBe(
      true,
    )
    const family = await getRegistryApi(db as never, 'divisions')
    expect(family?.releases.map(release => release.id)).toEqual(['new', 'old'])
    expect(await getRegistryApi(db as never, 'missing')).toBeNull()
  } finally {
    sqlite.close()
  }
})
