/** Query-only normalisation: canonical names and publisher evidence stay untouched. */
export function normaliseAddressText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[一二三四五六七八九](?=期)/g, digit =>
      String('一二三四五六七八九'.indexOf(digit) + 1),
    )
    .replace(/[’'`]/g, '')
    .replace(
      /\b(rd|st|ave|ln|sq|hwy|bldg|hse)\.?\b/g,
      word =>
        ({
          rd: 'road',
          st: 'street',
          ave: 'avenue',
          ln: 'lane',
          sq: 'square',
          hwy: 'highway',
          bldg: 'building',
          hse: 'house',
        })[word.replace('.', '')]!,
    )
    .replace(
      /\b(road|street)\s+([ewns])\b/g,
      (_, road, direction) =>
        `${road} ${{ e: 'east', w: 'west', n: 'north', s: 'south' }[direction as string]}`,
    )
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export type ParsedAddress = {
  text: string
  street: string | null
  numbers: [number, number] | null
}
const road =
  '(?:road|rd|street|st|avenue|ave|lane|ln|square|sq|highway|hwy|drive|court|path|terrace|boulevard|circuit|way)'
const number = '(\\d+)[a-z]?(?:\\s*[-–—]\\s*(\\d+)[a-z]?)?'

export function parseAddress(value: string): ParsedAddress {
  const input = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/\b(?:room|rm|unit|flat|shop|suite|level|floor)\s+[a-z\d-]+/g, ' ')
    .replace(/\b(?:\d+|g|lg|ug)\s*\/?f\b/g, ' ')
  // English number-first addresses, including road directions and section qualifiers.
  const forward = input.match(
    new RegExp(
      `(?:^|[\\s,])${number}號?\\s+([a-z][a-z\\s-]*?\\b${road}\\b(?:\\.?\\s+(?:east|west|north|south|central|[ewns]))?(?:\\s*-\\s*[^,]+)?)`,
      'i',
    ),
  )
  if (forward)
    return {
      text: normaliseAddressText(input),
      street: normaliseAddressText(forward[3]!),
      numbers: [Number(forward[1]), Number(forward[2] ?? forward[1])],
    }
  // Google commonly supplies street first, then a comma and a Chinese number label.
  const reversed = input.match(
    new RegExp(
      `(?:^|,)\\s*([a-z][a-z\\s-]*?\\b${road}\\b(?:\\.?\\s+(?:east|west|north|south|central|[ewns]))?)\\s*,\\s*${number}(?:號|\\b)`,
      'i',
    ),
  )
  if (reversed)
    return {
      text: normaliseAddressText(input),
      street: normaliseAddressText(reversed[1]!),
      numbers: [Number(reversed[2]), Number(reversed[3] ?? reversed[2])],
    }
  const chinese = input.match(
    /([\p{Script=Han}]+(?:街|道|路|巷|里|坊)[東西南北中]?)\s*(\d+)[a-z]?(?:\s*[-–—至]\s*(\d+)[a-z]?)?號?/u,
  )
  if (chinese)
    return {
      text: normaliseAddressText(input),
      street: chinese[1]!,
      numbers: [Number(chinese[2]), Number(chinese[3] ?? chinese[2])],
    }
  return { text: normaliseAddressText(input), street: null, numbers: null }
}

export function numberStems(parsed: ParsedAddress): string[] {
  if (!parsed.numbers) return []
  const [from, to] = parsed.numbers
  if (to < from || to - from > 200) return []
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i))
}
