import { describe, expect, test } from 'bun:test'
import { parseQianfanOcrOutput, QIANFAN_MODEL, QIANFAN_REVISION } from './qianfanOcr.ts'
import { qianfanMarkdownToLayout } from './qianfanLayout.ts'
import { parseLandsdGovernmentNoticePdfText } from './sources/hkgov/landsd/street/landsdStreet.ts'
import { isGovernmentNoticePostamble } from './sources/hkgov/landsd/street/landsdStreetPdf.ts'

const page = {
  engine: 'Qianfan-OCR',
  engineVersion: '5.16.1',
  model: QIANFAN_MODEL,
  revision: QIANFAN_REVISION,
  prompt: 'Parse this document to Markdown.',
  imageSha256: 'a'.repeat(64),
  text: 'Market Street',
  generatedTokens: 3,
  maxNewTokens: 8192,
  hitTokenLimit: false,
}

describe('Qianfan OCR evidence', () => {
  test('keeps the English inspection postamble out of the second bilingual street row', () => {
    const text = [
      'G.N. 3694',
      'STREET NAMES',
      `${'Description'.padEnd(70)}Name`,
      `${'The street is approximately 240 metres long.'.padEnd(70)}YUEN LUNG STREET`,
      `${'The road is approximately 200 metres long.'.padEnd(70)}YUEN CHING ROAD`,
      'Plan No. YLRM 102 may be inspected in the District Survey Office, Yuen Long at 8th Floor,',
      'Yuen Long Government Offices and Tai Kiu Market, 2 Kiu Lok Square, Yuen Long, New',
      '9 June 2000',
    ].join('\n')
    const parsed = parseLandsdGovernmentNoticePdfText(text, 'en')
    expect(parsed.entries.map(row => row.name)).toEqual([
      'YUEN LUNG STREET',
      'YUEN CHING ROAD',
    ])
    expect(parsed.entries[1]?.description).toBe(
      'The road is approximately 200 metres long.',
    )
    expect(isGovernmentNoticePostamble('Plan No. YLRM 102.', 'en')).toBe(false)
  })
  test('rejects truncation, empty text and a different model revision', () => {
    expect(parseQianfanOcrOutput(JSON.stringify(page)).text).toBe('Market Street')
    for (const change of [
      { hitTokenLimit: true },
      { generatedTokens: 8192 },
      { text: ' ' },
      { revision: 'other' },
      { imageSha256: '' },
      { engine: 'other' },
    ])
      expect(() =>
        parseQianfanOcrOutput(JSON.stringify({ ...page, ...change })),
      ).toThrow()
  })

  test('preserves Chinese notice row associations through HTML and Markdown tables', () => {
    const rows = [
      ['說明', '名稱'],
      ['這街道向北伸展約85米。', '廣善街'],
      ['這道路向南伸展。', '測試街'],
    ]
    const html = `<table>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`
    const markdown = rows
      .map(
        (row, index) => `| ${row.join(' | ')} |${index === 0 ? '\n| --- | --- |' : ''}`,
      )
      .join('\n')
    for (const table of [html, markdown]) {
      const parsed = parseLandsdGovernmentNoticePdfText(
        qianfanMarkdownToLayout(
          `第3079號公告\n街道命名\n${table}\n2000年5月19日\n地政總署署長`,
        ),
        'zh-Hant',
      )
      expect(parsed.diagnostics.status).toBe('success')
      expect(parsed.entries.map(row => [row.description, row.name])).toEqual(
        rows.slice(1),
      )
    }
  })

  test('adapts the single labelled pair observed in G.N. 3079', () => {
    const text =
      '第3079號公告\n\n## 街道命名\n\n說明\n\n這街道向北伸展約85米。\n\n名稱\n\n廣善街\n\n2000年5月19日\n地政總署署長'
    const parsed = parseLandsdGovernmentNoticePdfText(
      qianfanMarkdownToLayout(text),
      'zh-Hant',
    )
    expect(parsed.entries[0]?.name).toBe('廣善街')
    expect(parsed.entries[0]?.description).toBe('這街道向北伸展約85米。')
  })

  test('refuses merged or inconsistent table cells', () => {
    expect(() =>
      qianfanMarkdownToLayout('<table><tr><td colspan="2">name</td></tr></table>'),
    ).toThrow('merged cells')
    expect(() => qianfanMarkdownToLayout('| A | B |\n| one |')).toThrow(
      'inconsistent columns',
    )
  })

  test('keeps both description/name pairs from the retained G.N. 3694 output', async () => {
    // Qianfan revision 623bf5d20d446abdb36606aa4547cd0c18886fe5, 300 DPI.
    // 2000-v04-g23-n3694-x0-zh-Hant.pdf SHA-256:
    // 05b4b3ac3c795921b995b7c2a955ed04a23cfd8fe50d690fa8f60a8066e01088
    const raw = await Bun.file(
      `${import.meta.dir}/__fixtures__/qianfan-gn3694-zh.txt`,
    ).text()
    const parsed = parseLandsdGovernmentNoticePdfText(
      qianfanMarkdownToLayout(raw),
      'zh-Hant',
    )
    expect(
      parsed.entries.map(row => ({ name: row.name, description: row.description })),
    ).toEqual([
      {
        name: '元龍街',
        description:
          '這街道長約240米，以其與鳳攸東街的交界處為起點，至其與元政路的交界處終結。位置及路線在第YLRM 102號圖則上以黑網點標明。',
      },
      {
        name: '元政路',
        description:
          '這道路長約200米，以其與近元龍街的交界處為起點，至其盡頭處終結。位置及路線在第YLRM 102號圖則上以黑斜線標明。',
      },
    ])
    expect(parsed.gazetteDate).toBe('2000-06-09')
    expect(qianfanMarkdownToLayout(raw)).toContain('查閱第YLRM 102號圖則')
    for (const incomplete of [
      raw.replace('\n\n元政路\n', '\n'),
      raw.replace('\n\n元龍街\n', '\n'),
    ])
      expect(() => qianfanMarkdownToLayout(incomplete)).toThrow(
        'incomplete or ambiguous',
      )
  })

  test('handles wrapped descriptions and repeated name labels without guessing missing cells', () => {
    const text =
      '說明\n這街道向北伸展，\n位置及路線在圖則上標明。\n名稱\n測試街\n這道路向南伸展。\n名稱\n測試路\n2000年6月9日\n地政總署署長'
    const parsed = parseLandsdGovernmentNoticePdfText(
      qianfanMarkdownToLayout(text),
      'zh-Hant',
    )
    expect(parsed.entries.map(row => row.name)).toEqual(['測試街', '測試路'])
    expect(parsed.entries[0]?.description).toBe(
      '這街道向北伸展， 位置及路線在圖則上標明。',
    )
    expect(() =>
      qianfanMarkdownToLayout(text.replace('名稱\n測試路', '名稱')),
    ).toThrow()
  })
})
