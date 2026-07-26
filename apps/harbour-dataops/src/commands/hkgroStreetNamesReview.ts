import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { isCancel, log, note, outro, select } from '@clack/prompts'

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
    await printHkgroSourceInline({ archiveDir, record })
    const classification = await select({
      message: `Select ${record.year}/${record.hkgroPdfId}`,
      options: [
        {
          value: 'street-name' as const,
          label: reviewGreen('Accept as a street-history notice'),
          hint: 'Select its material kind next.',
        },
        {
          value: 'not-street-name' as const,
          label: reviewRed('Reject as not a street-history notice'),
        },
        {
          value: 'manual-review' as const,
          label: reviewYellow('Defer for later review'),
          hint: 'This remains eligible in a later review run.',
        },
      ],
    })
    if (isCancel(classification)) throw new Error('HKGRO street-name review cancelled.')

    const kind =
      classification === 'street-name'
        ? await selectStreetChangeKind(record.suggested.kinds)
        : null

    record.decision = {
      classification,
      kind,
      notes: null,
      reviewedAt: new Date().toISOString(),
    }
    await saveHkgroStreetDiscoveryReview(reviewPath, review)
    completed += 1
  }

  outro(
    `Saved ${completed} HKGRO curator decision${completed === 1 ? '' : 's'} locally: ${reviewPath}`,
  )
}

async function printHkgroSourceInline(input: {
  archiveDir: string
  record: HkgroStreetDiscoveryRecord
}) {
  const sourcePath = resolveHkgroSourcePath(
    input.archiveDir,
    input.record.source.localPath,
  )
  const previewDir = await mkdtemp(join(tmpdir(), 'saanseoi-hkgro-review-'))
  const previewPath = join(previewDir, 'source-page-1')
  try {
    await runInlineCommand('pdftoppm', [
      '-f',
      '1',
      '-l',
      '1',
      '-png',
      '-r',
      '300',
      '-singlefile',
      sourcePath,
      previewPath,
    ])
    await runInlineCommand('kitten', ['icat', '--fit=width', `${previewPath}.png`])
  } finally {
    await rm(previewDir, { force: true, recursive: true })
  }
}

async function runInlineCommand(command: string, args: string[]) {
  await new Promise<void>((resolveCommand, rejectCommand) => {
    const process = spawn(command, args, { stdio: 'inherit' })
    process.on('error', error => {
      rejectCommand(
        new Error(
          `Could not run ${command} while rendering the HKGRO source: ${error.message}`,
        ),
      )
    })
    process.on('exit', code => {
      if (code === 0) {
        resolveCommand()
      } else {
        rejectCommand(
          new Error(
            `${command} failed while rendering the HKGRO source (exit code ${code ?? 'unknown'}).`,
          ),
        )
      }
    })
  })
}

function resolveHkgroSourcePath(archiveDir: string, localPath: string) {
  if (isAbsolute(localPath)) {
    throw new Error(`HKGRO local path must be repository-relative: ${localPath}.`)
  }
  const canonical = resolve(REPO_ROOT, localPath)
  const suffix = relative(DEFAULT_ARCHIVE_DIR, canonical)
  if (suffix.startsWith('..') || isAbsolute(suffix)) {
    throw new Error(`HKGRO local path is outside its archive directory: ${localPath}.`)
  }
  return resolve(archiveDir, suffix)
}

export function recordsForReview(
  records: HkgroStreetDiscoveryRecord[],
  input: { includeAll: boolean },
) {
  return records.filter(record => {
    if (record.decision?.classification === 'street-name') return false
    if (record.decision?.classification === 'not-street-name') return false
    if (record.decision?.classification === 'manual-review') return input.includeAll
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
    .map((entry, index) => {
      const metadata = [entry.publicationDate, entry.notificationNumber]
        .filter(Boolean)
        .join(' · ')
      return `- ${metadata ? `${reviewMuted(metadata)}: ` : ''}${reviewValue(entry.subject, index)}`
    })
    .join('\n')
  const suggestions = record.suggested.kinds.length
    ? record.suggested.kinds.map(streetChangeKindLabel).join(', ')
    : 'none'
  return [
    formatReviewField('Year / HKGRO PDF', [`${record.year}`, record.hkgroPdfId]),
    `${reviewKey('TOC entries')}:\n${tocEntries}`,
    formatReviewField('Official scan', [record.source.officialUrl]),
    formatReviewField('Local scan', [record.source.localPath], 'muted'),
    formatReviewField('OCR output', [record.ocr.outputPath], 'muted'),
    formatReviewField(
      'Discovery score',
      [`${record.suggested.score}`],
      reviewScoreStyle(record.suggested.classification),
    ),
    `${reviewKey('Discovery reasons')}:\n${formatReviewList(record.suggested.reasons, 'muted') || '- none'}`,
    formatReviewField('Suggested material kinds', [suggestions]),
    `${reviewKey('OCR excerpt (not source evidence)')}:\n${reviewMuted(record.excerpt || '(none)')}`,
  ].join('\n\n')
}

function formatReviewField(
  label: string,
  values: string[],
  valueStyle: ReviewValueStyle = 'default',
) {
  return `${reviewKey(label)}: ${values
    .map((value, index) => reviewValue(value, index, valueStyle))
    .join(reviewSeparator())}`
}

function formatReviewList(values: string[], valueStyle: ReviewValueStyle) {
  return values
    .map((value, index) => `- ${reviewValue(value, index, valueStyle)}`)
    .join('\n')
}

function reviewScoreStyle(
  classification: HkgroStreetDiscoveryRecord['suggested']['classification'],
): ReviewValueStyle {
  if (classification === 'manual-review') return 'warning'
  if (classification === 'not-street-name') return 'error'
  return 'muted'
}

type ReviewValueStyle = 'default' | 'error' | 'muted' | 'warning'

function reviewKey(value: string) {
  return `\u001B[36m${value}\u001B[39m`
}

function reviewValue(
  value: string,
  index: number,
  style: ReviewValueStyle = 'default',
) {
  if (style === 'muted') return reviewMuted(value)
  if (style === 'warning') return reviewYellow(value)
  if (style === 'error') return reviewRed(value)
  const colours = [33, 32, 35]
  return `\u001B[${colours[index % colours.length]}m${value}\u001B[39m`
}

function reviewSeparator() {
  return ` ${reviewMuted('/')} `
}

function reviewMuted(value: string) {
  return `\u001B[90m${value}\u001B[39m`
}

function reviewGreen(value: string) {
  return `\u001B[32m${value}\u001B[39m`
}

function reviewRed(value: string) {
  return `\u001B[31m${value}\u001B[39m`
}

function reviewYellow(value: string) {
  return `\u001B[33m${value}\u001B[39m`
}
