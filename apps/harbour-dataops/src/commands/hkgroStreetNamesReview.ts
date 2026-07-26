import { isCancel, log, note, outro, select, text } from '@clack/prompts'
import { join, resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import {
  loadHkgroStreetDiscoveryReview,
  saveHkgroStreetDiscoveryReview,
  type HkgroStreetChangeKind,
  type HkgroStreetDiscoveryRecord,
} from './hkgroStreetNamesDiscover.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')
const DEFAULT_ARCHIVE_DIR = join(REPO_ROOT, 'data/hku/hkgro/street-name')

/**
 * Curate the OCR-ranked HKGRO discovery queue. The choices here only select
 * source PDFs for later extraction; they never publish source evidence or
 * change a canonical street snapshot.
 */
export async function runHkgroStreetNameReviewCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (target.remote) {
    throw new Error(
      '`hkgov-hkgro-street-names:review` is local-only. It records curator decisions locally and never uploads HKGRO scans, OCR, or street data.',
    )
  }
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error(
      'hkgov-hkgro-street-names:review does not accept positional arguments.',
    )
  }

  const archiveDir =
    typeof args.options['out-dir'] === 'string'
      ? resolve(args.options['out-dir'])
      : DEFAULT_ARCHIVE_DIR
  const reviewPath =
    typeof args.options['review-file'] === 'string'
      ? resolve(args.options['review-file'])
      : join(archiveDir, 'discovery/review.json')
  const includeAll = args.options.all === true
  const review = await loadHkgroStreetDiscoveryReview(reviewPath)
  const records = recordsForReview(review.records, { includeAll })

  if (records.length === 0) {
    log.info(
      includeAll
        ? 'No unfinished HKGRO street-name discovery records remain.'
        : 'No suggested manual-review HKGRO street-name records remain. Use --all to include unclassified records.',
    )
    outro(`HKGRO review remains local: ${reviewPath}`)
    return
  }

  log.info(
    `Reviewing ${records.length} ${includeAll ? 'unfinished' : 'suggested manual-review'} HKGRO source PDF${records.length === 1 ? '' : 's'}. Inspect the official scan before accepting a record; OCR is only a finding aid.`,
  )
  let completed = 0
  for (const record of records) {
    note(formatReviewContext(record), 'SOURCE PDF TO REVIEW')
    const classification = await select({
      message: `Select ${record.year}/${record.hkgroPdfId}`,
      options: [
        {
          value: 'street-name' as const,
          label: 'Accept as a street-history notice',
          hint: 'Select its material kind next.',
        },
        {
          value: 'not-street-name' as const,
          label: 'Reject as not a street-history notice',
        },
        {
          value: 'manual-review' as const,
          label: 'Defer for later review',
          hint: 'This remains eligible in a later review run.',
        },
      ],
    })
    if (isCancel(classification)) throw new Error('HKGRO street-name review cancelled.')

    const kind =
      classification === 'street-name'
        ? await selectStreetChangeKind(record.suggested.kinds)
        : null
    const notes = await text({
      message: 'Curator notes (optional)',
      placeholder: 'Why this selection was made, names found, or follow-up needed',
    })
    if (isCancel(notes)) throw new Error('HKGRO street-name review cancelled.')

    record.decision = {
      classification,
      kind,
      notes: notes.trim() || null,
      reviewedAt: new Date().toISOString(),
    }
    await saveHkgroStreetDiscoveryReview(reviewPath, review)
    completed += 1
  }

  outro(
    `Saved ${completed} HKGRO curator decision${completed === 1 ? '' : 's'} locally: ${reviewPath}`,
  )
}

export function recordsForReview(
  records: HkgroStreetDiscoveryRecord[],
  input: { includeAll: boolean },
) {
  return records.filter(record => {
    if (record.decision?.classification === 'street-name') return false
    if (record.decision?.classification === 'not-street-name') return false
    return input.includeAll || record.suggested.classification === 'manual-review'
  })
}

async function selectStreetChangeKind(
  suggestedKinds: HkgroStreetChangeKind[],
): Promise<HkgroStreetChangeKind> {
  const kind = await select({
    message: 'Material street-history kind',
    options: orderedKinds(suggestedKinds).map(value => ({
      value,
      label: streetChangeKindLabel(value),
      ...(suggestedKinds.includes(value) ? { hint: 'suggested by discovery' } : {}),
    })),
  })
  if (isCancel(kind)) throw new Error('HKGRO street-name review cancelled.')
  return kind
}

function orderedKinds(suggestedKinds: HkgroStreetChangeKind[]) {
  const allKinds: HkgroStreetChangeKind[] = [
    'declaration',
    'name-change',
    'deletion',
    'designation',
    'description-change',
  ]
  return [...suggestedKinds, ...allKinds.filter(kind => !suggestedKinds.includes(kind))]
}

function streetChangeKindLabel(kind: HkgroStreetChangeKind) {
  switch (kind) {
    case 'declaration':
      return 'Declaration'
    case 'name-change':
      return 'Naming or renaming'
    case 'deletion':
      return 'Deletion or closure'
    case 'designation':
      return 'Legally material designation'
    case 'description-change':
      return 'Description change'
  }
}

export function formatReviewContext(record: HkgroStreetDiscoveryRecord) {
  const tocEntries = record.tocEntries
    .map(entry => {
      const metadata = [entry.publicationDate, entry.notificationNumber]
        .filter(Boolean)
        .join(' · ')
      return `- ${metadata ? `${metadata}: ` : ''}${entry.subject}`
    })
    .join('\n')
  const suggestions = record.suggested.kinds.length
    ? record.suggested.kinds.map(streetChangeKindLabel).join(', ')
    : 'none'
  return [
    `Year / HKGRO PDF: ${record.year} / ${record.hkgroPdfId}`,
    `TOC entries:\n${tocEntries}`,
    `Official scan: ${record.source.officialUrl}`,
    `Local scan: ${record.source.localPath}`,
    `OCR output: ${record.ocr.outputPath}`,
    `Discovery score: ${record.suggested.score}`,
    `Discovery reasons:\n${record.suggested.reasons.map(reason => `- ${reason}`).join('\n') || '- none'}`,
    `Suggested material kinds: ${suggestions}`,
    `OCR excerpt (not source evidence):\n${record.excerpt || '(none)'}`,
  ].join('\n\n')
}
