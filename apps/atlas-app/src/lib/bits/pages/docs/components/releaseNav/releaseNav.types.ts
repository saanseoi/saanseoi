export type ReleaseNavVersion = {
  code: string
  cohortKey?: string | null
  href: string
  label: string
  revision?: number
}

export type ReleaseNavVersionPreload = (version: ReleaseNavVersion) => void

export type ReleaseNavDomain = {
  code: string
  href: string
  label: string
}

export type ReleaseNavTab = {
  id: string
  label: string
  compactLabel?: string
}

export type ReleaseNavOutlineItem = {
  id: string
  label: string
  href?: string
  depth?: number
}

export type ReleaseNavAction = {
  disabled?: boolean
  download?: boolean
  href?: string
  icon?: string
  id: string
  label: string
  onSelect?: () => void
  pressed?: boolean
}
