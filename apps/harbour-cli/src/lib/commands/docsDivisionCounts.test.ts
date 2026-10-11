import { afterAll, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { divisionDocumentationValues } from './docsDivisionCounts'
import { parseMarkdownFixture, renderMarkdownFixtureBody } from './docsRendering'

const directory = await mkdtemp(join(tmpdir(), 'division-docs-'))
afterAll(() => rm(directory, { recursive: true, force: true }))
const release = 'dr-hk-saanseoi-division-2026-10-01.0'
const sourceReleases = [
  'overture-division',
  'overture-division-area',
  'protomaps-island',
  'hkgov-landsd-division',
  'hkgov-rvd-division',
].map(source => ({ datasetCode: `ds-hk-${source}`, sourceVersion: '2026-09-01.3' }))
async function archive(type: 'division' | 'divisionArea', rows: object[]) {
  const code =
    type === 'division' ? release : release.replace('division-', 'division-area-')
  const path = join(directory, `${type}.zip`)
  await writeFile(
    path,
    zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          releaseCode: code,
          resourceType: type,
          datasetCode: code.replace('dr-', 'ds-').replace('-2026-10-01.0', ''),
          sourceReleases,
        }),
      ),
      'records.json': strToU8(JSON.stringify({ rows })),
    }),
  )
  return path
}

test('queries distinct coverage, uncovered divisions and classes within an exact archive pair', async () => {
  const division = await archive('division', [
    { id: 'a', class: 'hamlet', category: 'locality' },
    { id: 'b', class: 'microhood', category: 'hood' },
  ])
  const area = await archive('divisionArea', [
    { id: 'x', divisionId: 'a' },
    { id: 'y', divisionId: 'a' },
  ])
  const values = await divisionDocumentationValues(release, division, area)
  expect(values).toMatchObject({
    divisionCount: '2',
    areaCount: '2',
    coveredDivisionCount: '1',
    uncoveredDivisionCount: '1',
    classCount_hamlet: '1',
    countsRelease: release,
    protomapsVersion: '2026-09-01.3',
    basemapRelease: '2026-09-01',
  })
  expect(values.divisionArchiveSha256).toMatch(/^[a-f0-9]{64}$/)
  await expect(
    divisionDocumentationValues(release.replace('10-01', '09-01'), division, area),
  ).rejects.toThrow('Archive does not match')
  const badArea = await archive('divisionArea', [{ id: 'z', divisionId: 'missing' }])
  await expect(divisionDocumentationValues(release, division, badArea)).rejects.toThrow(
    'outside the release',
  )
})

test('renders each edition in three locales and rejects copied count scope', async () => {
  for (const month of ['09', '10']) {
    const path = resolve(
      import.meta.dir,
      `../../../../../fixtures/meta/releases/ds-hk-saanseoi-division/dr-hk-saanseoi-division-2026-${month}-01.0.md`,
    )
    const fixture = parseMarkdownFixture(await readFile(path, 'utf8'))
    const rendered = await renderMarkdownFixtureBody(fixture)
    expect(rendered).not.toContain('{{')
    expect(rendered).toContain(month === '09' ? '1 September 2026' : '1 October 2026')
    expect(rendered).toContain(month === '09' ? '2026年9月1日' : '2026年10月1日')
    expect(rendered).toContain(`/basemaps/releases/hk/2026-${month}-01`)
    expect(rendered.replace(/\*\*/g, '').replace(/\s+/g, ' ')).toContain(
      month === '09'
        ? '589 DivisionArea records cover 562 distinct divisions'
        : '591 DivisionArea records cover 563 distinct divisions',
    )
    await expect(
      renderMarkdownFixtureBody(fixture, {
        release: 'dr-hk-saanseoi-division-2026-11-01.0',
      }),
    ).rejects.toThrow('Refresh division documentation counts')
  }
})

test('rejects malformed release dates', async () => {
  await expect(
    renderMarkdownFixtureBody({
      body: '{{releaseDate:en}}',
      frontmatter: { releaseVersion: '2026-02-30.0' },
    }),
  ).rejects.toThrow('Cannot derive release date')
})
