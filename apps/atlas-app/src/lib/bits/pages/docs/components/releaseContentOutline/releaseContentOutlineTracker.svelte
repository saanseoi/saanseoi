<script lang="ts">
import { tick } from 'svelte'

import type { ReleaseContentHeading } from './releaseContentOutline.types'

type Props = {
  content?: HTMLElement
  headings: ReleaseContentHeading[]
  activeHeadingId?: string | null
}

let { content, headings, activeHeadingId = $bindable(null) }: Props = $props()

$effect(() => {
  const root = content
  const headingIds = headings.map(heading => heading.id)
  activeHeadingId = null
  if (!root || !headingIds.length) return

  let disposed = false
  let cleanup = () => {}
  void tick().then(() => {
    if (disposed) return
    const elements = headingIds
      .map(id => root.querySelector<HTMLElement>(`#${id}`))
      .filter((heading): heading is HTMLElement => heading !== null)
    if (!elements.length) return
    const activationOffset = Math.min(160, window.innerHeight * 0.25)
    const update = () => {
      const current =
        [...elements]
          .reverse()
          .find(heading => heading.getBoundingClientRect().top <= activationOffset) ??
        elements[0]
      activeHeadingId = current?.id ?? null
    }
    const observer = new IntersectionObserver(update, {
      root,
      rootMargin: `-${activationOffset}px 0px -65% 0px`,
    })
    elements.forEach(element => {
      observer.observe(element)
    })
    root.addEventListener('scroll', update, { passive: true })
    window.addEventListener('scroll', update, { passive: true })
    update()
    cleanup = () => {
      observer.disconnect()
      root.removeEventListener('scroll', update)
      window.removeEventListener('scroll', update)
    }
  })
  return () => {
    disposed = true
    cleanup()
  }
})
</script>
