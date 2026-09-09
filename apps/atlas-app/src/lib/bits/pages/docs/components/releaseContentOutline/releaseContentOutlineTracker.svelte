<script lang="ts">
import { tick } from 'svelte'

import type { ReleaseContentHeading } from './releaseContentOutline.types'
import {
  releaseNavActivationRootMargin,
  releaseNavActivationViewportFraction,
  releaseNavScrollsIndependently,
} from '../releaseNav/releaseNavScroll'

type Props = {
  content?: HTMLElement
  headings: ReleaseContentHeading[]
  activeHeadingId?: string | null
}

let { content, headings, activeHeadingId = $bindable(null) }: Props = $props()

$effect(() => {
  const root = content
  const headingIds = headings.map(heading => heading.id)
  if (!root || !headingIds.length) return

  let disposed = false
  let cleanup = () => {}
  void tick().then(() => {
    if (disposed) return
    const elements = headingIds
      .map(id => root.querySelector<HTMLElement>(`#${id}`))
      .filter((heading): heading is HTMLElement => heading !== null)
    if (!elements.length) return

    const activationLine = () => {
      const independentScroll = releaseNavScrollsIndependently(root)
      const viewportTop = independentScroll ? root.getBoundingClientRect().top : 0
      const viewportHeight = independentScroll ? root.clientHeight : window.innerHeight
      const normalOffset = viewportHeight * releaseNavActivationViewportFraction
      if (!independentScroll) return viewportTop + normalOffset

      // At the top, start at the first heading rather than looking past a short
      // opening section. Gradually restore the normal look-ahead as we scroll.
      const firstOffset =
        elements[0].getBoundingClientRect().top - viewportTop + root.scrollTop
      return viewportTop + Math.min(normalOffset, firstOffset + root.scrollTop)
    }
    const update = () => {
      const current =
        [...elements]
          .reverse()
          .find(heading => heading.getBoundingClientRect().top <= activationLine()) ??
        elements[0]
      activeHeadingId = current?.id ?? null
    }
    const observer = new IntersectionObserver(update, {
      root: releaseNavScrollsIndependently(root) ? root : null,
      rootMargin: releaseNavActivationRootMargin,
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
