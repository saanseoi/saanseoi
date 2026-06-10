export type PolicySection = {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export type PolicyDocument = {
  title: string
  chineseTitle: string
  version: string
  effectiveDate: string
  contactEmail: string
  standard?: string
  englishIntro: string[]
  chineseIntro: string[]
  englishSections: PolicySection[]
  chineseSections: PolicySection[]
}
