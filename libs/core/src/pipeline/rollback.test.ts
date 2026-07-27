import { describe, expect, test } from 'bun:test'

import { buildLatestReleaseRollbackSql } from './rollback'

describe('latest release rollback SQL', () => {
  test('builds division rollback SQL in safe import order', () => {
    const sql = buildLatestReleaseRollbackSql({
      apiReleaseSetId: 'release-set-new',
      previousApiReleaseSetId: 'release-set-old',
      previousReleaseId: 'release-old',
      releaseId: "release-new-'quoted'",
      snapshotId: 'snapshot-new',
      source: 'overture',
      sourceVersion: '2026-05-20.0',
      type: 'division',
    })

    expect(sql.current).toContain(
      "DELETE FROM divisionsI18n WHERE snapshotId = 'snapshot-new';",
    )
    expect(sql.current).toContain(
      "DELETE FROM divisions WHERE snapshotId = 'snapshot-new';",
    )
    expect(sql.history).toContain(
      "DELETE FROM snapshotVersionChanges WHERE snapshotId = 'snapshot-new';",
    )
    expect(sql.history).toContain(
      "UPDATE divisions SET isCurrent = 0 WHERE snapshotId = 'snapshot-new';",
    )
    expect(sql.source).toContain(
      'UPDATE overtureDivisions\nSET isCurrent = 1,\n  validToRelease = NULL,',
    )
    expect(sql.source).toContain(
      "UPDATE overtureDivisions\nSET releaseId = 'release-old',",
    )
    expect(sql.source).toContain(
      "DELETE FROM overtureDivisions WHERE releaseId = 'release-new-''quoted''' AND validFromRelease = '2026-05-20.0';",
    )
    expect(sql.meta).toContain(
      "DELETE FROM releases WHERE id = 'release-new-''quoted''';",
    )
    expect(sql.meta.indexOf('UPDATE releases')).toBeLessThan(
      sql.meta.indexOf('DELETE FROM releases'),
    )
  })

  test('builds address rollback SQL across source, history, current, and meta', () => {
    const sql = buildLatestReleaseRollbackSql({
      apiReleaseSetId: 'address-release-set-new',
      previousApiReleaseSetId: null,
      previousReleaseId: null,
      releaseId: 'address-release-new',
      snapshotId: 'address-snapshot-new',
      source: 'hkgov-dpo',
      sourceVersion: '2026-06-25.0',
      type: 'address',
    })

    expect(sql.current).toContain(
      "DELETE FROM address3dI18n WHERE snapshotId = 'address-snapshot-new';",
    )
    expect(sql.current).toContain(
      "DELETE FROM address2d WHERE snapshotId = 'address-snapshot-new';",
    )
    expect(sql.history).toContain(
      "DELETE FROM snapshotVersionChanges WHERE snapshotId = 'address-snapshot-new';",
    )
    expect(sql.history).toContain(
      "UPDATE address2d SET isCurrent = 0 WHERE snapshotId = 'address-snapshot-new';",
    )
    expect(sql.history).not.toContain('DELETE FROM address2d WHERE')
    expect(sql.source).toContain(
      'UPDATE hkgovAlsAddresses2d\nSET isCurrent = 1,\n  validToRelease = NULL,',
    )
    expect(sql.source).not.toContain('SET releaseId =')
    expect(sql.source).toContain(
      "DELETE FROM hkgovAlsAddresses2d WHERE releaseId = 'address-release-new' AND validFromRelease = '2026-06-25.0';",
    )
    expect(sql.meta).toContain(
      "DELETE FROM apiReleaseSets WHERE id = 'address-release-set-new';",
    )
    expect(sql.meta).not.toContain('UPDATE apiReleaseSets')
  })

  test('rejects unsupported source/type combinations', () => {
    expect(() =>
      buildLatestReleaseRollbackSql({
        apiReleaseSetId: 'release-set-new',
        releaseId: 'release-new',
        snapshotId: 'snapshot-new',
        source: 'unknown',
        sourceVersion: '2026-05-20.0',
        type: 'address',
      }),
    ).toThrow('Rollback is not implemented for source unknown/address.')
  })
})
