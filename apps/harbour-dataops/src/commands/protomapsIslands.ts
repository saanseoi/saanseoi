import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { ParsedArgs, UploadTarget } from '../../../harbour-cli/src/lib/cli/options'
import {
  protomapsSourceBundle,
  sha256,
  type SourceFeature,
} from '../lib/protomapsIslands'
import {
  buildSourceReleaseAssetObjectKey,
  uploadManagedSourceAsset,
} from '../../../harbour-cli/src/lib/sources/sourceAssets'
import { readProtomapsSourceArchive } from '../../../harbour-cli/src/lib/pipeline/curatedDivisions/protomapsSourceArchive'
import { processNativeSourceSqlRelease } from '../../../harbour-cli/src/lib/pipeline/local/nativeSourceSql'

const datasetCode = 'ds-hk-protomaps-island'
function option(args: ParsedArgs, key: string) {
  const value = args.options[key]
  if (typeof value !== 'string' || !value) throw Error(`Required --${key}`)
  return value
}
async function run(command: string[]) {
  const child = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit' })
  if (await child.exited) throw Error(`Failed: ${command[0]} ${command[1]}`)
}
export async function prepareProtomapsIslands(args: ParsedArgs) {
  const manifestPath = resolve(option(args, 'manifest'))
  const bytes = await readFile(manifestPath)
  const manifest = JSON.parse(bytes.toString())
  const version = option(args, 'source-version')
  if (
    !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(version) ||
    version.slice(0, 10) !== manifest.release.version
  )
    throw Error(
      'Source version must identify the basemap date and extraction revision.',
    )
  const out = resolve(option(args, 'out-dir'))
  await mkdir(out, { recursive: true })
  const sourcePath = resolve(manifest.provenance.source.path)
  const sourceBytes = await readFile(sourcePath)
  const landPath = resolve(
    dirname(manifestPath),
    `${manifest.region.name}-${manifest.release.version}.coastline-land.geojson`,
  )
  const landBytes = await readFile(landPath)
  if (sha256(landBytes) !== manifest.release.coastline.land.sha256)
    throw Error('Coastline land checksum differs from the basemap release.')
  const landBorderBytes = await readFile(
    resolve(
      dirname(manifestPath),
      `${manifest.region.name}-${manifest.release.version}.regional-border.geojson`,
    ),
  )
  if (sha256(landBorderBytes) !== manifest.release.coastline.border.sha256)
    throw Error('Regional land border checksum differs from the basemap release.')
  const pbf = resolve(out, 'islands.osm.pbf')
  const geojson = resolve(out, 'islands.geojson')
  await run([
    'osmium',
    'tags-filter',
    sourcePath,
    'nwr/place=island,islet,archipelago',
    '-o',
    pbf,
    '--overwrite',
  ])
  await run([
    'osmium',
    'export',
    pbf,
    '--add-unique-id=type_id',
    '--geometry-types=point,polygon',
    '-o',
    geojson,
    '--overwrite',
  ])
  const { records, islandSelections } = protomapsSourceBundle(
    JSON.parse(await readFile(geojson, 'utf8')).features as SourceFeature[],
    JSON.parse(landBytes.toString()).features as SourceFeature[],
    JSON.parse(landBorderBytes.toString()).features as SourceFeature[],
  )
  const descriptor = {
    schemaVersion: 2,
    datasetCode,
    sourceVersion: version,
    basemapVersion: manifest.release.version,
    sourceUrl: `https://tiles.saanseoi.hk/releases/hk/${manifest.release.version}.json`,
    inputs: {
      manifestSha256: sha256(bytes),
      regionalPbfSha256: sha256(sourceBytes),
      coastlineLandSha256: sha256(landBytes),
      regionalLandBorderSha256: sha256(landBorderBytes),
    },
  }
  const options = { mtime: new Date(`${version.slice(0, 10)}T00:00:00Z`) }
  const archive = zipSync({
    'manifest.json': [strToU8(JSON.stringify(descriptor)), options],
    'records.json': [strToU8(JSON.stringify(records)), options],
    'island-selections.json': [strToU8(JSON.stringify(islandSelections)), options],
    'basemap-manifest.json': [bytes, options],
  })
  const archivePath = resolve(out, `dr-hk-protomaps-island-${version}.zip`)
  await writeFile(archivePath, archive)
  console.log(
    JSON.stringify(
      {
        archivePath,
        sha256: sha256(archive),
        records: records.length,
        selectedIslands: islandSelections.length,
        osmFeatures: records.filter(r => r.properties.kind === 'osm-island').length,
        localised: records.filter(r => Object.keys(r.properties.names).length).length,
        coastlineLand: records.filter(r => r.properties.kind === 'coastline-land')
          .length,
      },
      null,
      2,
    ),
  )
}
export async function ingestProtomapsIslands(args: ParsedArgs, target: UploadTarget) {
  const archivePath = resolve(args.positionals[0] ?? '')
  const bytes = await readFile(archivePath)
  const { manifest, records } = readProtomapsSourceArchive(bytes)
  const version = String(manifest.sourceVersion)
  const releaseCode = `dr-hk-protomaps-island-${version}`
  const fileName = `${releaseCode}.zip`
  const hash = sha256(bytes)
  const key = buildSourceReleaseAssetObjectKey({
    datasetCode,
    publisherCode: 'protomaps',
    releaseCode,
    fileName,
    sha256: hash,
  })
  await uploadManagedSourceAsset(target, {
    fileName,
    filePath: archivePath,
    metadata: {
      assetKey: key,
      contentHash: hash,
      mediaType: 'application/zip',
      originalUrl: manifest.sourceUrl,
      retrievedAt: new Date().toISOString(),
      role: 'releaseSourceArchive',
    },
  })
  await processNativeSourceSqlRelease(target, {
    sourceOnly: true,
    recoverPublishedRelease: true,
    archivePath,
    archiveSha256: hash,
    archiveObjectKey: key,
    cohortKey: version,
    datasetCode,
    releaseNotesUrl: manifest.sourceUrl,
    rowCount: records.length,
    source: 'protomaps',
    sourceVersion: version,
    resourceType: 'divisionArea',
    theme: 'divisions',
    tables: [
      {
        name: 'protomapsIslandFeatures',
        provenance: 'required',
        replaceCurrentRows: true,
        rows: records.map(row => ({
          ...row,
          sources: [
            {
              dataset: datasetCode,
              sourceFile: key,
              sourceFeatureRef: row.sourceRecordId,
            },
          ],
        })),
      },
    ],
  })
  console.log(JSON.stringify({ releaseCode, records: records.length, sha256: hash }))
}
