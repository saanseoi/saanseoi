import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { alsSourcePayload, remapAlsSourceProperties } from './alsSourcePayload'

test('retained ALS remapping preserves values and rejects collisions', () => {
  expect(
    remapAlsSourceProperties({ enBuildingName: 'Name', zhHantBuildingName: null }),
  ).toEqual({ buildingNameEn: 'Name', buildingNameZhHant: null })
  expect(() =>
    remapAlsSourceProperties({ enBuildingName: 'A', buildingNameEn: 'B' }),
  ).toThrow('Duplicate')
  expect(
    remapAlsSourceProperties({
      '/Address/PremisesAddress/EngPremisesAddress/EngEstate/EngPhase/PhaseNo': 2,
      '/Address/PremisesAddress/ChiPremisesAddress/ChiStreet/LocationName': null,
      '/Address/PremisesAddress/EngPremisesAddress/Eng3dAddress': [],
    }),
  ).toEqual({ phaseNoEn: 2, streetLocationNameZhHant: null, address3dEn: [] })
  expect(() => remapAlsSourceProperties({ '/Easting': 1, easting: 2 })).toThrow(
    'Duplicate',
  )
  expect(() => alsSourcePayload({ properties: { 'a-b': 1, 'a/b': 2 } })).toThrow(
    'Duplicate',
  )
})

test('offline ALS rename SQL is guarded and exactly reversible', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-remap-'))
  const path = join(directory, 'source.sqlite')
  const output = join(directory, 'review.sql')
  const db = new Database(path)
  try {
    db.exec(
      'CREATE TABLE hkgovAlsAddresses2d (sourceRecordId TEXT, versionHash TEXT, properties TEXT)',
    )
    const original = JSON.stringify({
      '/Address/PremisesAddress/EngPremisesAddress/EngStreet/LocationName':
        ' Original ',
    })
    db.query('INSERT INTO hkgovAlsAddresses2d VALUES (?,?,?)').run(
      'record',
      'hash',
      original,
    )
    const child = Bun.spawn(
      [
        process.execPath,
        resolve(
          import.meta.dir,
          '../../../../../../scripts/remap-als-source-properties.ts',
        ),
        '--database',
        path,
        '--output',
        output,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const error = await new Response(child.stderr).text()
    expect(await child.exited, error).toBe(0)
    expect(db.query('SELECT properties FROM hkgovAlsAddresses2d').get()).toEqual({
      properties: original,
    })
    db.exec(await readFile(output, 'utf8'))
    expect(db.query('SELECT * FROM hkgovAlsAddresses2d').get()).toEqual({
      sourceRecordId: 'record',
      versionHash: 'hash',
      properties: '{"streetLocationNameEn":" Original "}',
    })
    db.exec(await readFile(output + '.rollback.sql', 'utf8'))
    expect(db.query('SELECT properties FROM hkgovAlsAddresses2d').get()).toEqual({
      properties: original,
    })
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
