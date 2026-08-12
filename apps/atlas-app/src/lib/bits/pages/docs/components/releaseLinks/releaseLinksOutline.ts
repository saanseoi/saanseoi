import type { ReleaseNavOutlineItem } from '../releaseNav/releaseNav.types'

import type { ReleaseLinksProvenancePresentation } from './components/releaseLinks.types'

type Target = 'entries' | 'groups'

export const getReleaseLinksOutline = (
  presentation: ReleaseLinksProvenancePresentation,
  target: Target = 'entries',
): ReleaseNavOutlineItem[] =>
  presentation.groups.flatMap(group => {
    if (!group.entries.length) return []

    if (target === 'groups') {
      if (!group.id || !group.title) return []
      return [
        {
          depth: 2,
          id: group.id,
          label: group.label ? `${group.label} · ${group.title}` : group.title,
        },
      ]
    }

    return group.entries.map(entry => ({
      depth: 2,
      id: entry.id ?? entry.href,
      label: `${entry.eyebrow} · ${entry.title}`,
    }))
  })
