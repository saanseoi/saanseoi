import type { RemoteQuery } from '$app/server'

type Options<Input, Output> = {
  createQuery: (input: Input) => RemoteQuery<Output>
  getInput: () => Input
  getKey: (input: Input) => string
  hasShell: () => boolean
  debounceMs?: number
  retainAcrossKeys?: boolean
}

export function createDeferredRemoteResource<Input, Output>({
  createQuery,
  getInput,
  getKey,
  hasShell,
  debounceMs = 80,
  retainAcrossKeys = true,
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

  let queryMatchesRequestedInput = $derived(getKey(input) === getKey(getInput()))
  let current = $derived(
    query.ready && queryMatchesRequestedInput
      ? query.current
      : retainAcrossKeys
        ? lastReady
        : null,
  )
  let loading = $derived(
    hasShell() &&
      !query.error &&
      (!queryMatchesRequestedInput || !query.ready || query.loading),
  )
  let showSkeleton = $derived(loading && (lastReady === null || !retainAcrossKeys))

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
