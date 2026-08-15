<script lang="ts">
export type MappingIntegration = {
  code?: string
  detail?: string
  id: string
  label: string
  summary: string
}

type Props = {
  description: string
  heading: string
  integrations: readonly MappingIntegration[]
  eyebrow: string
}

let { description, heading, integrations, eyebrow }: Props = $props()
let selectedId = $state('')
const selected = $derived(
  integrations.find(integration => integration.id === selectedId) ?? integrations[0],
)

$effect(() => {
  if (!integrations.some(integration => integration.id === selectedId)) {
    selectedId = integrations[0]?.id ?? ''
  }
})
</script>

<section class="mt-16 border-t border-border-card pt-10 md:mt-24 md:pt-14">
  <p
    class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
  >
    {eyebrow}
  </p>
  <h2 class="mt-3 max-w-3xl font-display text-headline-md font-bold text-primary">
    {heading}
  </h2>
  <p class="mt-5 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
    {description}
  </p>

  <fieldset class="mt-8 flex flex-wrap gap-2">
    <legend class="sr-only">{heading}</legend>
    {#each integrations as integration}
      <button
        type="button"
        aria-pressed={selected?.id === integration.id}
        class="rounded-full border px-4 py-2 font-body text-sm font-semibold transition-colors {selected?.id === integration.id ? 'border-primary bg-primary text-on-primary' : 'border-border-card bg-background text-foreground hover:bg-muted'}"
        onclick={() => (selectedId = integration.id)}
      >
        {integration.label}
      </button>
    {/each}
  </fieldset>

  {#if selected}
    <article
      class="mt-6 max-w-5xl border border-border-card bg-surface-container-low p-6 md:p-8"
    >
      <h3 class="font-display text-headline-sm font-bold text-primary">
        {selected.label}
      </h3>
      <p class="mt-3 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
        {selected.summary}
      </p>
      {#if selected.code}
        <pre
          class="mt-6 overflow-x-auto border border-border-card bg-[#171918] p-5 font-mono text-sm leading-6 text-[#e5e2de]"
        ><code>{selected.code}</code></pre>
      {/if}
      {#if selected.detail}
        <p class="mt-5 max-w-3xl font-body text-sm leading-6 text-foreground-alt">
          {selected.detail}
        </p>
      {/if}
    </article>
  {/if}
</section>
