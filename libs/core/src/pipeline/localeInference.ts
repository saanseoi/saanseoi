import {
  selectBranch,
  type BranchCounts,
  type RuleBranch,
} from '../provenance/branches'

export const localeDetection = {
  han: { source: '\\p{Script=Han}', flags: 'u' },
  latin: { source: '[A-Za-z]', flags: '' },
  english: { source: '^[A-Za-z0-9\\s\'".,&()\\-/]+$', flags: '' },
  split: { source: '^(\\S+)\\s+(.+)$', flags: 'u' },
  input:
    'Trim non-empty strings; evaluate primary names and unlabelled common/rule text. Labelled text bypasses inference.',
  splitCondition:
    'First whitespace split: left has Han and no Latin; right has Latin and no Han.',
}
const regex = (key: 'han' | 'latin' | 'english' | 'split') =>
  new RegExp(localeDetection[key].source, localeDetection[key].flags)
const han = regex('han')
const latin = regex('latin')
const english = regex('english')
const split = regex('split')
export const localeInferenceBranches: RuleBranch[] = [
  {
    id: 'inference.han',
    group: 'Locale Inference',
    precedence: 1,
    condition: {
      all: [
        { field: 'han', equals: true },
        { field: 'latin', equals: false },
      ],
    },
    result: 'zh-hant',
  },
  {
    id: 'inference.english',
    group: 'Locale Inference',
    precedence: 2,
    condition: {
      all: [
        { field: 'han', equals: false },
        { field: 'english', equals: true },
      ],
    },
    result: 'en',
  },
  {
    id: 'inference.split',
    group: 'Locale Inference',
    precedence: 3,
    condition: { field: 'splitHanLatin', equals: true },
    result: 'zh-hant + en',
  },
  {
    id: 'inference.none',
    group: 'Locale Inference',
    precedence: 4,
    condition: { all: [] },
    result: 'none',
  },
]
export type InferredLocaleValue = {
  locale: 'en' | 'zh-hans' | 'zh-hant'
  value: string
}

export function inferLocale(
  value: unknown,
  counts?: BranchCounts,
): InferredLocaleValue[] {
  const text = typeof value === 'string' ? value.trim() : ''
  const parts = text.match(split)
  const left = parts?.[1] ?? ''
  const right = parts?.[2] ?? ''
  const result = selectBranch(
    localeInferenceBranches,
    {
      han: han.test(text),
      latin: latin.test(text),
      english: !!text && english.test(text),
      splitHanLatin:
        han.test(left) && !latin.test(left) && !han.test(right) && latin.test(right),
    },
    'none',
    counts,
  )
  if (result === 'zh-hant + en')
    return [
      { locale: 'zh-hant', value: left },
      { locale: 'en', value: right },
    ]
  if (result === 'zh-hant' || result === 'en') return [{ locale: result, value: text }]
  return []
}
