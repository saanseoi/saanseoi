import { m } from '$lib/bits/internal/i18n'

export const navigationItems = [
  { href: '/datasets', label: () => m.nav_datasets() },
  { href: '/projects', label: () => m.nav_projects() },
  { href: '/community', label: () => m.nav_community() },
] as const
