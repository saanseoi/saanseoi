import { XMLParser } from 'fast-xml-parser'

const decoder = new XMLParser({ parseTagValue: false, trimValues: false })

function cellText(value: string): string {
  const plain = value.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, '')
  return String(decoder.parse(`<cell>${plain}</cell>`).cell ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function fixedWidthTable(rows: string[][]) {
  const count = rows[0]?.length ?? 0
  if (count < 2 || rows.some(row => row.length !== count))
    throw new Error('Qianfan OCR table has inconsistent columns.')
  const widths = Array.from(
    { length: count },
    (_, column) => Math.max(...rows.map(row => row[column]?.length ?? 0)) + 8,
  )
  return rows
    .map(row =>
      row
        .map((cell, index) => cell.padEnd(widths[index] ?? 0))
        .join('')
        .trimEnd(),
    )
    .join('\n')
}

/** Adapt explicit model table cells to the Gazette parser's character columns. */
export function qianfanMarkdownToLayout(markdown: string) {
  const html = markdown.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, table => {
    if (/(?:rowspan|colspan)\s*=\s*["']?(?:[2-9]|\d{2,})/i.test(table))
      throw new Error('Qianfan OCR table contains merged cells requiring review.')
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
      [...(row[1] ?? '').matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell =>
        cellText(cell[1] ?? ''),
      ),
    )
    return `\n${fixedWidthTable(rows)}\n`
  })
  const lines = html.split(/\r?\n/)
  const output: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    if (line.trim().startsWith('|')) {
      const rows: string[][] = []
      while (index < lines.length && lines[index]?.trim().startsWith('|')) {
        const cells = (lines[index] ?? '')
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map(cellText)
        if (!cells.every(cell => /^:?-{3,}:?$/.test(cell))) rows.push(cells)
        index++
      }
      index--
      output.push(fixedWidthTable(rows))
    } else {
      output.push(line.replace(/^#{1,6}\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1'))
    }
  }
  const text = output.join('\n')
  return chineseLabelledRows(text)
}

/** Consume the whole labelled table, so a later row cannot become continuation text. */
function chineseLabelledRows(text: string) {
  const lines = text.split('\n')
  const blocks = lines
    .map((line, index) => ({ text: line.trim(), index }))
    .filter(line => line.text)
  const start = blocks.findIndex(line => /^(?:說明|描述)$/.test(line.text))
  if (start < 0) return text
  const rows: string[][] = [['說明', '名稱']]
  const fail = () =>
    new Error(
      'Qianfan OCR labelled table has an incomplete or ambiguous description/name pair.',
    )
  const isName = (value: string) =>
    /^[\p{Script=Han}]{2,20}$/u.test(value.replace(/\s/g, ''))
  const isDescription = (value: string) =>
    /^(?:這|此|該)(?:街道|道路|交匯處)/u.test(value.replace(/\s/g, ''))
  const isEnd = (value: string) =>
    /^(?:查\s*閱|地政總署署長|\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/u.test(value)
  let cursor = start + 1
  while (cursor < blocks.length && !isEnd(blocks[cursor]?.text ?? '')) {
    const description: string[] = []
    if (!isDescription(blocks[cursor]?.text ?? '')) throw fail()
    while (cursor < blocks.length) {
      const value = blocks[cursor]?.text ?? ''
      if (description.length && (/^(?:名稱|名字)$/.test(value) || isName(value))) break
      if (isEnd(value) || (description.length && isDescription(value))) throw fail()
      description.push(value)
      cursor++
    }
    // The first row must declare its name column; subsequent rows may omit the label.
    if (/^(?:名稱|名字)$/.test(blocks[cursor]?.text ?? '')) cursor++
    else if (rows.length === 1) throw fail()
    const name = blocks[cursor]?.text ?? ''
    if (!isName(name) || isDescription(name) || isEnd(name)) throw fail()
    rows.push([cellText(description.join(' ')), cellText(name)])
    cursor++
  }
  if (rows.length === 1) throw fail()
  return [
    ...lines.slice(0, blocks[start]?.index),
    fixedWidthTable(rows),
    ...lines.slice(blocks[cursor]?.index ?? lines.length),
  ].join('\n')
}
