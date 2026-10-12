import { createGzip, createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { asyncBufferFromFile } from 'hyparquet'
import { readParquetObjectsInBatches } from '../libs/core/src/pipeline/parquetR2'
/** Read-only chronological replay over publisher Parquet or JSONL. Writes reports only. */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { basename } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { normaliseOverturePlace } from '../libs/core/src/pipeline/services/places/place'
import {
  matchPlaceIdentities,
  placeIdentityEvidence,
  type PlaceIdentityCandidate,
} from '../libs/core/src/pipeline/services/places/placeIdentity'
import { isExcludedOverturePlace } from '../apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadPreparation'

async function* readRecords(file: string) {
  if (file.endsWith('.parquet')) {
    for await (const batch of readParquetObjectsInBatches(
      await asyncBufferFromFile(file),
      1000,
    ))
      yield* batch
  } else {
    for await (const line of createInterface({
      input: file.endsWith('.gz')
        ? createReadStream(file).pipe(createGunzip())
        : createReadStream(file),
      crlfDelay: Infinity,
    }))
      if (line.trim()) yield JSON.parse(line) as Record<string, unknown>
  }
}

const [output, ...files] = process.argv.slice(2)
if (!output || !files.length)
  throw new Error(
    'Usage: bun scripts/audit-place-identities.ts OUTPUT_DIR RELEASE.jsonl ... (chronological)',
  )
await mkdir(output, { recursive: true })
let previous: PlaceIdentityCandidate[] = []
let priorRelease = ''
const summaries = []
for (const file of files) {
  const release =
    file
      .replace(/\.gz$/, '')
      .match(/(?:^|\/)(\d{4}-\d{2}-\d{2}\.\d+)(?:\/|\.jsonl$)/)?.[1] ??
    basename(file, '.jsonl')
  if (release <= priorRelease) throw new Error('Inputs must be strictly chronological.')
  const evidence = []
  for await (const row of readRecords(file)) {
    const place = normaliseOverturePlace(row, release)
    if (place && !isExcludedOverturePlace(place))
      evidence.push(placeIdentityEvidence(place.raw, place.lng, place.lat))
  }
  const decisions = matchPlaceIdentities(
    evidence,
    previous,
    'audit-hk-overture-places',
    release,
  )
  const oldSourceIds = new Set(previous.map(x => x.evidence.sourceId))
  const currentSourceIds = new Set(evidence.map(x => x.sourceId))
  const matched = decisions.filter(x => x.outcome === 'matched')
  const summary = {
    release,
    count: evidence.length,
    sourceAdded: evidence.filter(x => !oldSourceIds.has(x.sourceId)).length,
    sourceRemoved: previous.filter(x => !currentSourceIds.has(x.evidence.sourceId))
      .length,
    matched: matched.length,
    rescuedSourceIds: matched.filter(x => !oldSourceIds.has(x.sourceId)).length,
    rebrands: matched.filter(x => x.reason === 'rebrand').length,
    new: decisions.length - matched.length,
    unmatchedPrevious: previous.length - matched.length,
    ambiguous: decisions.filter(x => x.reason === 'ambiguous').length,
    stableSourceRejected: decisions.filter(
      x => x.outcome === 'new' && oldSourceIds.has(x.sourceId),
    ).length,
  }
  summaries.push(summary)
  await pipeline(
    Readable.from(
      (function* () {
        for (const decision of decisions) yield `${JSON.stringify(decision)}\n`
      })(),
    ),
    createGzip(),
    createWriteStream(`${output}/${release}.decisions.jsonl.gz`),
  )
  console.log(JSON.stringify(summary))
  previous = decisions.map(x => ({ id: x.id, evidence: x.evidence }))
  priorRelease = release
}
await writeFile(`${output}/summary.json`, `${JSON.stringify(summaries, null, 2)}\n`)
