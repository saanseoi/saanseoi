import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parquetWriteBuffer } from 'hyparquet-writer'
import { LANDSD_STREET_NAMING_URL } from './landsdStreet.ts'
import type { LandsdStreetLifecycleReview } from './landsdStreetCuration.ts'
import type {
  LandsdStreetOperatorReport,
  LandsdStreetRecord,
} from './landsdStreetIngestTypes.ts'
import { LANDSD_STREET_DATASET_CODE } from './landsdStreetIngestConfig.ts'
import { nullable, required } from './landsdStreetIngestIo.ts'

export function buildStreetReleaseNotes(
  records: LandsdStreetRecord[],
  sourceVersion: string,
) {
  const notices = records.filter(record => record.sourceKind !== 'baseline')
  const declarations = notices.filter(record => record.noticeType === 'declaration')
  const otherNotices = notices.filter(record => record.noticeType !== 'declaration')
  const isCurrentBaseline = notices.length === 0
  const lines = [
    '---',
    `dataset: "${LANDSD_STREET_DATASET_CODE}"`,
    `release: "dr-hk-hkgov-landsd-street-${sourceVersion}"`,
    'regionCode: "hk"',
    'source: "hkgov-landsd"',
    `sourceVersion: "${sourceVersion}"`,
    'type: "street"',
    `cohortKey: "${sourceVersion}"`,
    '---',
    '',
    '# EN',
    '',
    ...(isCurrentBaseline
      ? [
          'Initial SaanSeoi publication of the current Lands Department gazetted street-name register.',
          'This release contains the English and Traditional Chinese publisher names as a present-state baseline. Historical Government Notices and e-Gazette artefacts are intentionally deferred to later revisions.',
        ]
      : [
          'Subsequent street-name declarations and related Government Notices processed from the LandsD bilingual source pages.',
          'The current gazetted street-name register is retained in the release payload and is not enumerated as changelog entries.',
        ]),
    '',
  ]
  for (const record of declarations) {
    const en = record.i18n.find(item => item.locale === 'en')
    if (!en) continue
    lines.push(`## ${en.name}`, '')
    if (record.gazetteDate) lines.push(`- Gazette date: ${record.gazetteDate}`)
    if (record.noticeType) lines.push(`- Notice type: ${record.noticeType}`)
    const governmentNotice = record.evidenceAssets.find(
      asset => asset.role === 'governmentNotice',
    )
    if (governmentNotice) {
      lines.push(
        `- Government Notice: [${governmentNotice.label ?? 'source PDF'}](${governmentNotice.originalUrl})`,
      )
    }
    for (const plan of record.evidenceAssets.filter(
      asset => asset.role === 'gazettePlan',
    )) {
      lines.push(`- Gazette Plan: [${plan.label ?? 'source PDF'}](${plan.originalUrl})`)
    }
    for (const preview of record.evidenceAssets.filter(
      asset => asset.role === 'gazettePlanPreview',
    )) {
      lines.push(`- ![Gazette plan preview](${preview.assetUrl})`)
    }
    lines.push('')
  }
  if (otherNotices.length > 0) {
    lines.push('## Other notices processed', '')
    for (const record of otherNotices) {
      const en = record.i18n.find(item => item.locale === 'en')
      if (!en) continue
      const governmentNotice = record.evidenceAssets.find(
        asset => asset.role === 'governmentNotice',
      )
      const notice = governmentNotice
        ? ` [${governmentNotice.label ?? 'Government Notice'}](${governmentNotice.originalUrl})`
        : ''
      lines.push(`- ${en.name} — ${record.noticeType ?? 'notice'}${notice}`)
    }
    lines.push('')
  }
  lines.push(
    '# ZH-HANT',
    '',
    isCurrentBaseline
      ? '山水 | SaanSeoi 首次發布地政總署現行刊憲街道名稱清單，保留發布者的英文及繁體中文名稱。歷史政府公告及電子憲報資料將於後續修訂加入。'
      : '本版本保留地政總署原始中英文通知、憲報圖則及受管資產連結。',
    '',
    '# ZH-HANS',
    '',
    isCurrentBaseline
      ? '山水 | SaanSeoi 首次发布地政总署现行刊宪街道名称清单，保留发布者的英文及繁体中文名称。历史政府公告及电子宪报资料将在后续修订加入。'
      : '本版本保留地政总署原始中英文通知、宪报图则及受管资产链接。',
    '',
  )
  return `${lines.join('\n')}`
}

export async function writeStreetParquet(
  outputPath: string,
  records: LandsdStreetRecord[],
  sourceVersion: string,
) {
  await mkdir(dirname(outputPath), { recursive: true })
  const parquet = parquetWriteBuffer({
    rowGroupSize: 10_000,
    columnData: [
      required(
        'id',
        records.map(record => record.recordKey),
      ),
      required(
        'theme',
        records.map(() => 'streets'),
      ),
      required(
        'type',
        records.map(() => 'street'),
      ),
      required(
        'source_kind',
        records.map(record => record.sourceKind),
      ),
      required(
        'defer_to_notices',
        records.map(record => String(record.deferToNotices)),
      ),
      nullable(
        'street_id',
        records.map(record => record.streetId),
      ),
      nullable(
        'gazette_date',
        records.map(record => record.gazetteDate),
      ),
      nullable(
        'notice_type',
        records.map(record => record.noticeType),
      ),
      nullable(
        'application',
        records.map(record =>
          record.application ? JSON.stringify(record.application) : null,
        ),
      ),
      nullable(
        'notice_ref',
        records.map(record => record.noticeRef),
      ),
      nullable(
        'effective_date',
        records.map(record => record.effectiveDate),
      ),
      required(
        'previous_notice_refs',
        records.map(record => JSON.stringify(record.previousNoticeRefs)),
      ),
      nullable(
        'raw_extracted_text',
        records.map(record =>
          record.rawExtractedText ? JSON.stringify(record.rawExtractedText) : null,
        ),
      ),
      nullable(
        'parser_diagnostics',
        records.map(record =>
          record.parserDiagnostics ? JSON.stringify(record.parserDiagnostics) : null,
        ),
      ),
      required(
        'district_codes',
        records.map(record => JSON.stringify(record.districtCodes)),
      ),
      required(
        'evidence_assets',
        records.map(record => JSON.stringify(record.evidenceAssets)),
      ),
      required(
        'i18n',
        records.map(record => JSON.stringify(record.i18n)),
      ),
      required(
        'source_version',
        records.map(() => sourceVersion),
      ),
      required(
        'source_url',
        records.map(() => LANDSD_STREET_NAMING_URL),
      ),
    ],
  })
  await writeFile(outputPath, new Uint8Array(parquet))
}

export function buildOperatorReport(
  report: Omit<LandsdStreetOperatorReport, 'lifecycleReview'> & {
    lifecycleReview?: LandsdStreetLifecycleReview[]
  },
): LandsdStreetOperatorReport {
  return { ...report, lifecycleReview: report.lifecycleReview ?? [] }
}

export async function writeOperatorReport(
  outputDir: string,
  report: LandsdStreetOperatorReport,
) {
  const path = join(outputDir, 'operator-report.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return path
}

export async function writeLifecycleReview(
  outputDir: string,
  review: LandsdStreetLifecycleReview[],
) {
  const path = join(outputDir, 'lifecycle-review.json')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(review, null, 2)}\n`, 'utf8')
  return path
}

export function fixturePathFor(sourceVersion: string) {
  return resolve(
    import.meta.dir,
    '../../../../../../../fixtures/meta/releases',
    LANDSD_STREET_DATASET_CODE,
    `dr-hk-hkgov-landsd-street-${sourceVersion}.md`,
  )
}
