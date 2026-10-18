import { afterNavigate, beforeNavigate } from '$app/navigation'
import { onDestroy } from 'svelte'

/** Cancel work on departure, and resume it if navigation retains the component. */
export function createNavigationRequestScope(onResume: () => void) {
  let controller = new AbortController()
  const reset = () => {
    controller.abort()
    controller = new AbortController()
  }
  beforeNavigate(({ from, to }) => {
    if (from?.url.pathname !== to?.url.pathname) controller.abort()
  })
  afterNavigate(() => {
    if (!controller.signal.aborted) return
    reset()
    onResume()
  })
  onDestroy(() => controller.abort())
  return {
    get signal() {
      return controller.signal
    },
    reset,
  }
}
