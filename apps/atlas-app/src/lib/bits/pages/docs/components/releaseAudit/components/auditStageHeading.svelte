<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import ArrowRight from '@iconify-svelte/proicons/arrow-right'

let { stage, label, flow }: { stage: string; label: string; flow: string } = $props()
let endpoints = $derived(flow.split('→').map(value => value.trim()))
</script>

<header
  class="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-lg border border-border-card bg-background-alt px-5 py-5 sm:px-6"
>
  <p
    class="ml-auto font-mono text-right text-lg font-medium uppercase tracking-tight text-secondary/75 sm:order-last sm:text-xl"
  >
    {label}
  </p>
  <h2
    id={`audit-stage-${stage}`}
    data-audit-stage-heading
    data-audit-toc-title={label}
    aria-label={`${label}: ${flow}`}
    class="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 sm:flex sm:w-auto sm:gap-5"
  >
    <span class="grid min-w-0 gap-1">
      <span
        class="font-mono text-xs font-normal uppercase tracking-widest text-foreground-alt"
        >{m.source_audit_stage_from()}</span
      >
      <span class="text-xl font-medium sm:text-2xl">{endpoints[0]}</span>
    </span>
    <span class="flex h-8 items-center text-foreground-alt" aria-hidden="true">
      <ArrowRight class="size-6" />
    </span>
    <span class="grid min-w-0 gap-1">
      <span
        class="font-mono text-xs font-normal uppercase tracking-widest text-foreground-alt"
        >{m.source_audit_stage_to()}</span
      >
      <span class="text-xl font-medium sm:text-2xl">{endpoints[1]}</span>
    </span>
  </h2>
</header>
