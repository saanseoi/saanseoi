export type SourceFlowInput = {
  id: string
  publisher: string
  source: string
  href?: string
  icon?: string
  iconBorder?: 'saanseoi' | 'protomaps' | 'overture' | 'hkgov' | 'dpang'
  iconPadding?: 'none' | 'inset'
  fallbackIcon?: string
  accent: string
  cardTone?: 'soft'
  iconTone?: 'saanseoi' | 'light' | 'hkgov' | 'diana' | 'protomaps'
  fields?: SourceFlowField[]
  planned?: boolean
  variant?: string
}

export type SourceFlowField = {
  label: string
  value: string
}

export type SourceFlowDomain = {
  id: string
  label: string
  primary: SourceFlowInput
  variants: SourceFlowInput[]
}

export type SourceFlowLane = {
  id: string
  label: string
  href: string
  accent: string
  secondary: string
  ink: string
  image: string
  primary: SourceFlowInput
  primaryGroupLabel: string
  groupLabel: 'domain' | 'cohort'
  defaultGroupExpanded?: boolean
  defaultAllGroupsExpanded?: boolean
  defaultInputLimit?: number
  domains: SourceFlowDomain[]
}
