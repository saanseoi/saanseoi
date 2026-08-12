export type GuideChoice = {
  badge?: string
  badgeIcon?: string
  description: string
  disabled?: boolean
  darkImage?: string
  icon?: string
  image?: string
  label: string
  note?: string
  summary?: string
  value: string
}

export type GuideOutlineItem = {
  hidden?: boolean
  id: string
  label: string
}

export type GuideDecision = {
  id: string
  label: string
  selection?: string
}

export type GuideDependency = {
  name: string
  pinnedVersion: string
}
