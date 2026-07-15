import { m } from '$lib/bits/internal/i18n'

export const navigationItems = [
  { href: '/data', icon: 'proicons:database', label: () => m.nav_data() },
  { href: '/sources', icon: 'proicons:archive', label: () => m.nav_sources() },
  {
    href: '/manifesto',
    icon: 'hugeicons:scroll-01',
    label: () => m.nav_manifesto(),
  },
  { href: '/docs', icon: 'proicons:book', label: () => m.nav_docs() },
  // { href: '/projects', icon: 'proicons:sapling', label: () => m.nav_projects() },
  // { href: '/community', icon: 'proicons:pizza', label: () => m.nav_community() },
] as const
