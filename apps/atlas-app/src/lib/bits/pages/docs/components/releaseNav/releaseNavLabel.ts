const minorWords = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'via',
  'vs',
])

const wordPattern = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu

const titleCaseText = (value: string) => {
  const isInlineCodeAt = (index: number) =>
    (value.slice(0, index).match(/`/g)?.length ?? 0) % 2 === 1
  const words = [...value.matchAll(wordPattern)].filter(
    match => !isInlineCodeAt(match.index),
  )
  const firstWordIndex = words[0]?.index
  const lastWordIndex = words.at(-1)?.index

  return value.replace(wordPattern, (word, offset: number) => {
    if (isInlineCodeAt(offset)) return word
    const lower = word.toLocaleLowerCase('en')
    if (word !== lower) return word
    if (offset !== firstWordIndex && offset !== lastWordIndex && minorWords.has(lower))
      return lower
    return `${lower.charAt(0).toLocaleUpperCase('en')}${lower.slice(1)}`
  })
}

export const formatReleaseNavLabel = (label: string) => {
  if (label === 'Notes and limitations') return 'Notes & Limitations'
  return titleCaseText(label)
}
