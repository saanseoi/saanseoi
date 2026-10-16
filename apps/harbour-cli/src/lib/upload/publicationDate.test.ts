import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { readFixturePublicationDate } from './publicationDate'

test('reads verified upstream dates from release fixtures', async () => {
  const datasetCode = 'ds-hk-hkgov-pland-division-pu'
  expect(
    await readFixturePublicationDate({
      datasetCode,
      releaseCode: 'dr-hk-hkgov-pland-division-pu-2021::divisionArea',
      sourceVersion: '2021',
    }),
  ).toBe('2022-06-24')
  expect(
    await readFixturePublicationDate({
      datasetCode: 'ds-hk-hkgov-censtatd-population-households-district',
      releaseCode:
        'dr-hk-hkgov-censtatd-division-statistic-population-households-district-2026-Q2',
      sourceVersion: '2026-Q2',
    }),
  ).toBeUndefined()
})

test('ignores body dates and rejects invalid fixture dates', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'publication-date-'))
  const plan = {
    datasetCode: 'ds-hk-test-division',
    releaseCode: 'dr-hk-test-division-2021',
    sourceVersion: '2021',
  }
  const directory = resolve(root, 'fixtures/meta/releases/ds-hk-test-division')
  try {
    expect(await readFixturePublicationDate(plan, root)).toBeUndefined()
    await mkdir(directory, { recursive: true })
    await writeFile(
      resolve(directory, 'dr-hk-test-division-2021.md'),
      '---\nsourceVersion: "2021"\n---\npublicationDate: "2022-06-24"\n',
    )
    expect(await readFixturePublicationDate(plan, root)).toBeUndefined()
    await writeFile(
      resolve(directory, 'dr-hk-test-division-2021.md'),
      '---\npublicationDate: "2023-02-29"\n---\n',
    )
    await expect(readFixturePublicationDate(plan, root)).rejects.toThrow(
      'Invalid publicationDate',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
