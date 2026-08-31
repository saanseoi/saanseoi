<script lang="ts">
import { dev } from '$app/env'
import { page } from '$app/state'
import { Main } from '#lib/bits/primitives/main/index.js'
import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  error: App.Error
}

let { error }: Props = $props()
let isStaleOptimisedDependency = $derived(
  dev && error.message.includes('Failed to fetch dynamically imported module'),
)
</script>

<Main
  class="mx-auto flex min-h-[50vh] w-full max-w-6xl items-center px-6 py-16 md:px-10"
>
  <section class="max-w-2xl space-y-5">
    <p class="font-mono text-sm tracking-[0.16em] text-foreground-alt">{page.status}</p>
    <h1
      class="font-display text-display-md leading-[0.98] font-bold text-primary md:text-[4.5rem]"
    >
      {isStaleOptimisedDependency ? m.error_stale_dependency_title() : m.error_title()}
    </h1>
    <p class="text-lg leading-relaxed text-foreground-alt">
      {isStaleOptimisedDependency
        ? m.error_stale_dependency_description()
        : m.error_description()}
    </p>
    {#if isStaleOptimisedDependency}
      <p
        class="rounded-lg border border-data-warning/35 bg-data-warning/10 p-4 font-mono text-sm break-all text-foreground-alt"
      >
        {error.message}
      </p>
    {/if}
    <a
      class="inline-flex rounded-full bg-primary px-5 py-3 font-semibold text-on-primary"
      href="/"
    >
      {m.error_return_home()}
    </a>
  </section>
</Main>
