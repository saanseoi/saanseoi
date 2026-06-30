import { m } from '$lib/bits/internal/i18n'

export const navigationItems = [
  { href: '/datasets', icon: 'proicons:database', label: () => m.nav_datasets() },
  { href: '/projects', icon: 'proicons:sapling', label: () => m.nav_projects() },
  { href: '/community', icon: 'proicons:pizza', label: () => m.nav_community() },
] as const
