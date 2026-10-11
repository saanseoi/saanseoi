import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readDistrictCoverageAreas } from './districtCoverage'

test('all Stats maps select ready SaanSeoi district land polygons and exclude government, territorial and non-district geometry', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite }) as never
  try {
    sqlite.exec(`
      CREATE TABLE snapshots(id, snapshotLineageId, resourceType, status, publishedAt, createdAt);
      CREATE TABLE snapshotLineages(id, variant, regionCode);
      CREATE TABLE divisionAreas(divisionId, geometry, updatedAt, variant, snapshotId, isLand, isTerritorial);
      CREATE TABLE divisions(id, class, snapshotId);
      CREATE TABLE divisionPublicationState(scopeId, snapshotId, status, preparedAt, publicationToken);
      CREATE TABLE divisionAreaPublicationState(scopeId, snapshotId, status, preparedAt, publicationToken);
      INSERT INTO snapshotLineages VALUES ('simple', 'saanseoi', 'hk'), ('full', 'hkgov-censtatd-landclipped:simplified', 'hk');
      INSERT INTO snapshots VALUES ('old','simple','divisionArea','published','2016','2016'), ('selected','simple','divisionArea','published','2021','2021'), ('full','full','divisionArea','published','2026','2026'), ('districts','simple','division','published','2021','2021');
      INSERT INTO divisionAreas VALUES ('district','{"type":"Polygon","coordinates":[]}', '2021','saanseoi','stable-scope',1,0), ('district','null','2021','saanseoi','stable-scope',1,1), ('village','null','2021','saanseoi','stable-scope',1,0);
      INSERT INTO divisions VALUES ('district','district','district-scope'), ('village','village','district-scope');
      INSERT INTO divisionPublicationState VALUES ('district-scope','districts','current','ready','token');
      INSERT INTO divisionAreaPublicationState VALUES ('stable-scope','selected','current','ready','token');
    `)
    expect(
      (await readDistrictCoverageAreas(db, db)).map(row => row.divisionId),
    ).toEqual(['district'])
    sqlite.exec("UPDATE divisionAreaPublicationState SET status='publishing'")
    expect(await readDistrictCoverageAreas(db, db)).toEqual([])
    sqlite.exec(
      "UPDATE divisionAreaPublicationState SET status='current', snapshotId='other'",
    )
    expect(await readDistrictCoverageAreas(db, db)).toEqual([])
  } finally {
    sqlite.close()
  }
})
