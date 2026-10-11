import type { Snippet } from 'svelte'
import type { ReleaseAnalyticsSurface } from '../releaseLinks/components/releaseLinks.types.js'

export type ReleaseNavVersion = {
  code: string
  apiVersion?: string
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
  emphasis?: string
  id: string
  label: string
  href?: string
  depth?: number
}

export type ReleaseNavAction = {
  disabled?: boolean
  download?: boolean
  downloadLinks?: Array<{ href: string; label: string }>
  href?: string
  icon?: string
  infoContent?: Snippet
  infoDescription?: string
  id: string
  label: string
  onSelect?: () => void
  tooltip?: string
  onValueChange?: (value: string) => void
  options?: Array<{
    label: string
    value: string
  }>
  pressed?: boolean
  value?: string
  analyticsSurface?: ReleaseAnalyticsSurface
}
