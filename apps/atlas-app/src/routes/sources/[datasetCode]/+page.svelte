<script lang="ts">
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'

let { data } = $props()
let source = $derived(data.source)
let locale = $derived(getCurrentLocale())
let name = $derived(selectLocalisedRow(source.datasetI18n, locale)?.name ?? source.code)
</script>

<Seo title={name} description={m.source_no_published_notes()} />

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8">
  <h1 class="font-display text-headline-lg font-bold text-primary">{name}</h1>
  <p class="mt-3 font-body text-body-lg text-foreground-alt">
    {m.source_no_published_notes()}
  </p>
</Main>
