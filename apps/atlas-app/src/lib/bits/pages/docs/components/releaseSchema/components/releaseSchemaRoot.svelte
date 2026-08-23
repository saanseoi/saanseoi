<script lang="ts">
import { onMount } from 'svelte'

import { getOpenApiSchemaForFamily } from '../releaseSchema.presentation'
import type { OpenApiDocument, ReleaseSchemaModel } from '../releaseSchema.types'
import Node from './releaseSchemaNode.svelte'

type Props = {
  apiFamily: string
}

let { apiFamily }: Props = $props()
let model = $state<ReleaseSchemaModel | null>(null)
let loading = $state(true)
let errorMessage = $state<string | null>(null)

onMount(() => {
  let cancelled = false

  void fetch('/openapi')
    .then(async response => {
      if (!response.ok)
        throw new Error(`OpenAPI request failed with ${response.status}.`)
      return (await response.json()) as OpenApiDocument
    })
    .then(document => {
      if (cancelled) return
      model = getOpenApiSchemaForFamily(document, apiFamily)
      if (!model) errorMessage = 'This API schema is not available yet.'
    })
    .catch(() => {
      if (!cancelled)
        errorMessage = 'The API schema could not be loaded. Please try again.'
    })
    .finally(() => {
      if (!cancelled) loading = false
    })

  return () => {
    cancelled = true
  }
})
</script>

<section aria-label="API schema">
  {#if loading}
    <p class="font-body text-body-md text-foreground-alt">Loading schema…</p>
  {:else if errorMessage}
    <p class="font-body text-body-md text-foreground-alt">{errorMessage}</p>
  {:else if model}
    <div
      class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
    >
      <Node
        name={model.name}
        referencePath={[model.name]}
        schema={model.schema}
        schemas={model.schemas}
      />
    </div>
  {/if}
</section>
