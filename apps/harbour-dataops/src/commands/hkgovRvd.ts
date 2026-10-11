import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { zipSync, strToU8 } from 'fflate'
import type { ParsedArgs, UploadTarget } from '../../../harbour-cli/src/lib/cli/options'
import {
  buildSourceReleaseAssetObjectKey,
  uploadManagedSourceAsset,
} from '../../../harbour-cli/src/lib/sources/sourceAssets'
import { processNativeSourceSqlRelease } from '../../../harbour-cli/src/lib/pipeline/local/nativeSourceSql'

/** PDF plus deterministic extraction are retained together as the source archive. */
export async function ingestRvdAreas(args: ParsedArgs, target: UploadTarget) {
  const pdfPath = args.positionals[0]
  const out = args.options['out-dir']
  if (!pdfPath || typeof out !== 'string') throw Error('Required PDF path, --out-dir.')
  await mkdir(out, { recursive: true })
  const recordsPath = join(out, 'records.json')
  const child = Bun.spawn(
    [
      'python3',
      resolve(import.meta.dir, '../../scripts/parse-rvd-areas.py'),
      pdfPath,
      recordsPath,
    ],
    { stdout: 'inherit', stderr: 'inherit' },
  )
  if (await child.exited) throw Error('RVD PDF extraction failed.')
  const parsed = JSON.parse(await readFile(recordsPath, 'utf8'))
  const datasetCode = 'ds-hk-hkgov-rvd-division'
  const version = `${parsed.publishedAt}.0`
  const releaseCode = `dr-hk-hkgov-rvd-division-${version}`
  const fileName = `${releaseCode}.zip`
  const archivePath = join(out, fileName)
  const bytes = zipSync(
    {
      '06.pdf': new Uint8Array(await readFile(pdfPath)),
      'records.json': strToU8(JSON.stringify(parsed)),
    },
    { mtime: new Date('1980-01-01T00:00:00Z') },
  )
  await writeFile(archivePath, bytes)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const key = buildSourceReleaseAssetObjectKey({
    datasetCode,
    publisherCode: 'hkgov-rvd',
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
      originalUrl: parsed.sourceUrl,
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
    releaseNotesUrl: parsed.publicationEvidence,
    rowCount: parsed.records.length,
    source: 'hkgov-rvd',
    sourceVersion: version,
    resourceType: 'division',
    theme: 'divisions',
    tables: [
      {
        name: 'hkgovRvdAreas',
        provenance: 'required',
        replaceCurrentRows: true,
        rows: parsed.records.map(({ sourceRecordId, ...properties }: any) => ({
          sourceRecordId,
          properties,
          sources: [
            { dataset: datasetCode, sourceFile: '06.pdf', page: properties.page },
          ],
        })),
      },
    ],
  })
  console.log(
    JSON.stringify({ releaseCode, records: parsed.records.length, archivePath }),
  )
}
