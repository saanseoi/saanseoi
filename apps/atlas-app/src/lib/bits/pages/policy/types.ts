export type PolicySection = {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export type PolicyLocale = {
  title: string
  intro: string[]
  sections: PolicySection[]
}

export type PolicyDocument = {
  version: string
  effectiveDate: string
  contactEmail: string
  standard?: string
  i18n: {
    en: PolicyLocale
    'zh-hant': PolicyLocale
  }
}
