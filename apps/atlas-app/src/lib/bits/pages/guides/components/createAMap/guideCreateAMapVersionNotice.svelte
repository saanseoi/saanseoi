<script lang="ts">
import { onMount } from 'svelte'

import type { GuideDependency } from '../shared/guide.types'

type Version = GuideDependency & { currentVersion: string }
type Props = {
  dependencies: GuideDependency[]
  latestLabel: string
  majorUpdateLabel: string
}

let { dependencies, latestLabel, majorUpdateLabel }: Props = $props()
let versions = $state<Version[]>([])

function major(version: string) {
  return Number(version.split('.')[0])
}

let hasMajorUpdate = $derived(
  versions.some(
    version => major(version.currentVersion) > major(version.pinnedVersion),
  ),
)

onMount(() => {
  let cancelled = false
  void Promise.all(
    dependencies.map(async dependency => {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(dependency.name)}/latest`,
      )
      if (!response.ok) throw new Error('Could not load package metadata.')
      const metadata = (await response.json()) as { version?: unknown }
      return typeof metadata.version === 'string'
        ? { ...dependency, currentVersion: metadata.version }
        : null
    }),
  )
    .then(results => {
      if (!cancelled)
        versions = results.filter((item): item is Version => item !== null)
    })
    .catch(() => {
      if (!cancelled) versions = []
    })
  return () => {
    cancelled = true
  }
})
</script>

{#if versions.length}
  <p
    class={`font-body text-body-sm leading-6 ${hasMajorUpdate ? 'text-secondary' : 'text-foreground-alt'}`}
  >
    {@html hasMajorUpdate ? majorUpdateLabel : latestLabel}
    <span class="font-mono text-xs">
      {versions.map(version => `${version.name} ${version.currentVersion}`).join(' · ')}
    </span>
  </p>
{/if}
