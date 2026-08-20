<script lang="ts">
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import type {
  ReleaseAnalyticsSurface,
  ReleaseLinkRequestExample,
} from './releaseLinks.types'

type Props = {
  copyLabel: string
  label: string
  request: ReleaseLinkRequestExample
  analyticsSurface: ReleaseAnalyticsSurface
}

let { analyticsSurface, copyLabel, label, request }: Props = $props()
let copied = $state(false)
let copiedTimeout: ReturnType<typeof setTimeout> | undefined
const apiBaseUrl = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
  /\/+$/,
  '',
)
const requestText = (value: ReleaseLinkRequestExample) =>
  apiBaseUrl +
  value.path +
  (value.query ?? [])
    .map(
      (parameter, index) =>
        `${index === 0 ? '?' : '&'}${parameter.key}=${parameter.value}`,
    )
    .join('')

async function copyRequest() {
  if (!navigator.clipboard) return

  try {
    await navigator.clipboard.writeText(requestText(request))
    trackClientProductUsage({
      event: 'client.copy_request',
      surface: analyticsSurface,
      entityType: 'action',
      entityId: 'request',
    })
    copied = true
    if (copiedTimeout) clearTimeout(copiedTimeout)
    copiedTimeout = setTimeout(() => {
      copied = false
    }, 2_000)
  } catch {
    trackClientProductUsage({
      event: 'client.copy_request',
      surface: analyticsSurface,
      entityType: 'action',
      entityId: 'request',
      outcome: 'failure',
    })
    copied = false
  }
}
</script>

<div
  class="relative border border-data-outline-variant/60 bg-data-surface-container-lowest px-3 py-2 font-mono text-label-sm leading-relaxed"
>
  <button
    class="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full text-foreground-alt transition hover:bg-data-surface-container-high hover:text-data-primary"
    type="button"
    aria-label={copyLabel}
    title={copyLabel}
    onclick={copyRequest}
  >
    <Icon
      icon={copied ? 'ion:checkmark-outline' : 'ion:copy-outline'}
      class="size-4"
      aria-hidden="true"
    />
  </button>
  <code class="block pr-8">
    <span
      class="mr-2 font-body text-caption font-semibold uppercase tracking-[0.12em] text-foreground-alt"
    >
      {label}
    </span>
    <span class="font-semibold text-data-primary">{request.method ?? 'GET'}</span>
    <span class="text-primary"> {request.path}</span>
    {#each request.query ?? [] as parameter, index}
      <span class="mt-1 block pl-8">
        <span class="text-foreground-alt">{index === 0 ? '?' : '&'}</span>
        <span class="text-data-secondary">{parameter.key}</span>
        <span class="text-foreground-alt">=</span>
        <span class="text-data-primary">{parameter.value}</span>
      </span>
    {/each}
  </code>
</div>
