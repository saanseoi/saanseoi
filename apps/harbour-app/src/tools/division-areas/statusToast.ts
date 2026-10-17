/** Keep editor feedback visible independently of the scrollable control panels. */
export function createStatusToast(status: HTMLElement) {
  const toast = document.createElement('aside')
  toast.className = 'status-toast'
  toast.setAttribute('aria-label', 'Editor notification')
  status.setAttribute('aria-atomic', 'true')
  let timeout: ReturnType<typeof setTimeout> | undefined
  const hide = () => {
    clearTimeout(timeout)
    toast.hidden = true
  }
  const resetTimeout = () => {
    clearTimeout(timeout)
    if (!toast.hidden) timeout = setTimeout(hide, 5_000)
  }
  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.className = 'status-toast-dismiss'
  dismiss.textContent = '×'
  dismiss.setAttribute('aria-label', 'Dismiss notification')
  dismiss.onclick = hide
  toast.append(status, dismiss)
  toast.hidden = !status.textContent
  document.body.append(toast)
  resetTimeout()

  return (message: string, tone: 'info' | 'error' = 'info') => {
    toast.hidden = !message
    toast.classList.toggle('status-toast-error', tone === 'error')
    status.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite')
    status.textContent = message
    resetTimeout()
  }
}
