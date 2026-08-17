import type { RemoteQuery } from '$app/server'

type Options<Input, Output> = {
  createQuery: (input: Input) => RemoteQuery<Output>
  getInput: () => Input
  getKey: (input: Input) => string
  hasShell: () => boolean
  debounceMs?: number
}

export function createDeferredRemoteResource<Input, Output>({
  createQuery,
  getInput,
  getKey,
  hasShell,
  debounceMs = 80,
}: Options<Input, Output>) {
  let requestedInput = $state<Input | null>(null)
  let input = $derived(requestedInput ?? getInput())

  $effect(() => {
    const nextInput = getInput()
    const timer = window.setTimeout(() => {
      requestedInput = nextInput
    }, debounceMs)

    return () => window.clearTimeout(timer)
  })

  let query = $derived(createQuery(input))
  let lastReady = $state<Output | null>(null)

  $effect(() => {
    if (query.ready) lastReady = query.current
  })

  let current = $derived(query.ready ? query.current : lastReady)
  let loading = $derived(
    hasShell() &&
      !query.error &&
      (getKey(input) !== getKey(getInput()) || !query.ready || query.loading),
  )
  let showSkeleton = $derived(loading && lastReady === null)

  let error = $derived(query.error)
  let ready = $derived(query.ready)

  return {
    get current() {
      return current
    },
    get error() {
      return error
    },
    get loading() {
      return loading
    },
    get query() {
      return query
    },
    get ready() {
      return ready
    },
    get showSkeleton() {
      return showSkeleton
    },
  }
}
