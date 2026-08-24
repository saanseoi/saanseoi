<script lang="ts">
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
let expandedNodeStates = $state<Record<string, boolean>>({})
let expandAllToken = $state(0)

function setExpandedNodeState(path: string, expanded: boolean) {
  expandedNodeStates = { ...expandedNodeStates, [path]: expanded }
}

function expandAll() {
  expandAllToken += 1
}

function getOpenApiPath() {
  const version = apiVersion.replace(`api-${apiFamily}-`, '')
  return /^v\d+(?:\.\d+)?$/.test(version)
    ? `/openapi/${apiFamily}/${version}`
    : '/openapi'
}

$effect(() => {
  const path = getOpenApiPath()
  const requestedLocale = locale
  let cancelled = false

  loading = true
  errorMessage = null
  model = null

  void fetch(`${path}?locale=${encodeURIComponent(requestedLocale)}`)
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
  <p class="font-body text-body-md leading-relaxed text-foreground-alt">
    This
    <GuideReference
      href={`saanseoi:${locale.toLowerCase()}:definition/schema/v1`}
      label="schema"
    />
    describes the resource objects returned in the <code>data</code> array when you make
    a request to the Divisions API. It describes the selected response profile;
    <code>profile</code>
    changes that resource shape for particular use cases.
  </p>
  <p>
    The full response wraps those resources in
    <a
      class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
      href="https://jsonapi.org/"
      rel="noreferrer"
      target="_blank"
      >JSON:API</a
    >
    . Its <code>meta</code> keys provide extra context about the response, such as
    pagination details, while its <code>links</code> keys give you URLs for this
    response, other pages of results, or related resources. This keeps resources,
    relationships, pagination and links in one predictable format across API families.
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
        {expandAllToken}
        {expandedNodeStates}
        name={profileModel.name}
        onExpandAll={expandAll}
        onExpandedNodeStateChange={setExpandedNodeState}
        referencePath={[profileModel.name]}
        schema={profileModel.schema}
        schemas={profileModel.schemas}
      />
    </div>
  {/if}
</section>
