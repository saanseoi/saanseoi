<script lang="ts">
import { Main } from '#lib/bits/index.js'
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import { getSourcePageData } from '#lib/registry/meta.remote.js'

let { params } = $props()
let source = $derived(await getSourcePageData(params.datasetCode))
let locale = $derived(getCurrentLocale())
let name = $derived(selectLocalisedRow(source.datasetI18n, locale)?.name ?? source.code)
</script>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-14 md:px-8">
  <h1 class="font-display text-headline-lg font-bold text-primary">{name}</h1>
  <p class="mt-3 font-body text-body-lg text-foreground-alt">
    {m.source_no_published_notes()}
  </p>
</Main>
