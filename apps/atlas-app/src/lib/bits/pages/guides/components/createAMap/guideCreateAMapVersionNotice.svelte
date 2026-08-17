<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import type { GuideDependency } from '../shared/guide.types'

type Props = {
  contactAfter: string
  contactBefore: string
  contactLabel: string
  dependency: GuideDependency
  library: string
  majorDifference: string
  minorDifference: string
  noticeLabel: string
  versionDescription: string
}

let {
  contactAfter,
  contactBefore,
  contactLabel,
  dependency,
  library,
  majorDifference,
  minorDifference,
  noticeLabel,
  versionDescription,
}: Props = $props()
let currentVersion = $state<string>()

function major(version: string) {
  return Number(version.split('.')[0])
}

function minor(version: string) {
  return Number(version.split('.')[1])
}

let hasMajorUpdate = $derived(
  Boolean(currentVersion && major(currentVersion) > major(dependency.pinnedVersion)),
)
let hasMinorOrMajorUpdate = $derived(
  Boolean(
    currentVersion &&
      (major(currentVersion) > major(dependency.pinnedVersion) ||
        (major(currentVersion) === major(dependency.pinnedVersion) &&
          minor(currentVersion) > minor(dependency.pinnedVersion))),
  ),
)

$effect(() => {
  let cancelled = false
  currentVersion = undefined
  void fetch(`https://registry.npmjs.org/${encodeURIComponent(dependency.name)}/latest`)
    .then(async response => {
      if (!response.ok) throw new Error('Could not load package metadata.')
      const metadata = (await response.json()) as { version?: unknown }
      if (!cancelled && typeof metadata.version === 'string') {
        currentVersion = metadata.version
      }
    })
    .catch(() => {
      if (!cancelled) currentVersion = undefined
    })
  return () => {
    cancelled = true
  }
})
</script>

{#if currentVersion && hasMinorOrMajorUpdate}
  <aside
    class="flex max-w-3xl items-start gap-3 border-l-2 border-[#f2c26d] bg-surface-container-low px-4 py-3"
  >
    <Icon
      icon="material-symbols-light:warning-rounded"
      class="mt-0.5 size-5 shrink-0 text-[#f2c26d]"
      aria-hidden="true"
    />
    <div class="min-w-0">
      <p
        class="font-body text-label-sm font-semibold tracking-[0.12em] text-[#f2c26d] uppercase"
      >
        {noticeLabel}
      </p>
      <p class="mt-1 font-body text-body-sm leading-6 text-foreground-alt">
        {versionDescription
          .replace('{library}', library)
          .replace('{pinnedVersion}', dependency.pinnedVersion)
          .replace('{currentVersion}', currentVersion)}
        {' '}
        {hasMajorUpdate ? majorDifference : minorDifference}
        {' '}
        {contactBefore}
        <a
          class="font-semibold text-secondary underline underline-offset-4"
          href="mailto:guides@saanseoi.hk"
          >{contactLabel}</a
        >{contactAfter}
      </p>
    </div>
  </aside>
{/if}
