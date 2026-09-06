import { translateAzureTexts } from '../sources/landsd/street/landsdStreetTranslation.ts'
import {
  colorGrey,
  colorTeal,
  colorYellow,
} from '../localPipeline/progressFormatting.ts'
import type {
  CenstatdFieldLocalisation,
  CenstatdSchemaMeasureCandidate,
} from './censtatdMeasureCurationTypes.ts'

export async function resolveChineseLocalisationProposals(input: {
  candidate: Pick<CenstatdSchemaMeasureCandidate, 'localisations'> | undefined
  englishDescription: string
  englishName: string
  translate?: typeof translateAzureTexts
}) {
  const officialZhHant = schemaCandidateLocalisation(input.candidate, 'zh-Hant')
  const officialZhHans = schemaCandidateLocalisation(input.candidate, 'zh-Hans')
  const officialEnglish = schemaCandidateLocalisation(input.candidate, 'en')
  if (!officialEnglish || !officialZhHant || !officialZhHans)
    return { zhHans: null, zhHant: null }
  if (
    input.englishName === officialEnglish.name &&
    input.englishDescription === officialEnglish.description
  ) {
    return { zhHans: officialZhHans, zhHant: officialZhHant }
  }
  const translate = input.translate ?? translateAzureTexts
  const texts = [input.englishName, input.englishDescription]
  const [zhHant, zhHans] = await Promise.all([
    translate(texts, { from: 'en', to: 'zh-Hant' }),
    translate(texts, { from: 'en', to: 'zh-Hans' }),
  ])
  return {
    zhHans: machineLocalisation(
      zhHans,
      input.englishName,
      input.englishDescription,
      'zh-Hans',
    ),
    zhHant: machineLocalisation(
      zhHant,
      input.englishName,
      input.englishDescription,
      'zh-Hant',
    ),
  }
}

export function formatProposalLocalisation(
  label: string,
  english: string,
  zhHant: string,
  zhHans: string,
) {
  return `${colorTeal(label)}: ${colorYellow(english)} ${colorGrey('(')}${colorGrey(zhHant)} ${colorTeal('/')} ${colorGrey(zhHans)}${colorGrey(')')}`
}

export function schemaCandidateLocalisation(
  candidate: Pick<CenstatdSchemaMeasureCandidate, 'localisations'> | undefined,
  locale: CenstatdFieldLocalisation['locale'],
) {
  return candidate?.localisations.find(localisation => localisation.locale === locale)
}

function machineLocalisation(
  translated: ReadonlyMap<string, string>,
  englishName: string,
  englishDescription: string,
  locale: CenstatdFieldLocalisation['locale'],
): CenstatdFieldLocalisation {
  const name = translated.get(englishName)
  const description = translated.get(englishDescription)
  if (!name || !description)
    throw new Error(`Azure Translator returned an incomplete ${locale} field proposal.`)
  return { description, isTranslationVerified: false, locale, name }
}

export function isLocalisationVerified(
  proposal: CenstatdFieldLocalisation | null,
  name: string,
  description: string,
) {
  return proposal && proposal.name === name && proposal.description === description
    ? proposal.isTranslationVerified
    : true
}

export function canonicalMeasureTokens(value: string) {
  return new Set(
    value.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g)?.map(token => token.toLowerCase()),
  )
}

export function intersectionSize(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
) {
  return [...left].filter(value => right.has(value)).length
}
