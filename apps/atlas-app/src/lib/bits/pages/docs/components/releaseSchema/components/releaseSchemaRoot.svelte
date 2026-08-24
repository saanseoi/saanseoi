<script lang="ts">
import { onMount } from 'svelte'
import { getCurrentLocale } from '#lib/bits/internal/i18n.js'
import GuideReference from '#lib/bits/pages/guides/components/shared/guideReference.svelte'

import {
  getOpenApiSchemaForFamily,
  getProfileSchema,
} from '../releaseSchema.presentation'
import type {
  ApiProfileName,
  OpenApiDocument,
  ReleaseSchemaModel,
} from '../releaseSchema.types'
import Node from './releaseSchemaNode.svelte'

type Props = {
  apiFamily: string
  apiVersion: string
  profile: ApiProfileName
}

let { apiFamily, apiVersion, profile }: Props = $props()
let model = $state<ReleaseSchemaModel | null>(null)
let loading = $state(true)
let errorMessage = $state<string | null>(null)
let locale = $derived(getCurrentLocale())
let profileModel = $derived(model && getProfileSchema(model, apiFamily, profile))

function getOpenApiPath() {
  const version = apiVersion.replace(`api-${apiFamily}-`, '')
  return /^v\d+(?:\.\d+)?$/.test(version)
    ? `/openapi/${apiFamily}/${version}`
    : '/openapi'
}

onMount(() => {
  let cancelled = false

  void fetch(getOpenApiPath())
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

<section class="space-y-4" aria-label="API schema">
  <p class="max-w-3xl font-body text-body-md leading-relaxed text-foreground-alt">
    This
    <GuideReference
      href={`saanseoi:${locale.toLowerCase()}:definition/schema/v1`}
      label="schema"
    />
    describes the selected response profile. SaanSeoi APIs use
    <a
      class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
      href="https://jsonapi.org/"
      rel="noreferrer"
      target="_blank"
      >JSON:API</a
    >
    so resources, relationships, pagination and links follow one predictable format
    across API families.
  </p>
  {#if loading}
    <p class="font-body text-body-md text-foreground-alt">Loading schema…</p>
  {:else if errorMessage}
    <p class="font-body text-body-md text-foreground-alt">{errorMessage}</p>
  {:else if profileModel}
    <div
      class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
    >
      <Node
        name={profileModel.name}
        referencePath={[profileModel.name]}
        schema={profileModel.schema}
        schemas={profileModel.schemas}
      />
    </div>
  {/if}
</section>
