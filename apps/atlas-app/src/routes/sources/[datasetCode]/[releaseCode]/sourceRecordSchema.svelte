<script lang="ts">
import {
  resolveOvertureSourceRecordFieldDefinition,
  resolveSourceRecordSchema,
  type SourceRecordSchema,
  type SourceRecordSchemaField,
  type ResourceType,
} from '@repo/core/sourceRecordSchemas'
import { page } from '$app/state'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'

import { m } from '#lib/bits/internal/i18n.js'
import Node from '#lib/bits/pages/docs/components/releaseSchema/components/releaseSchemaNode.svelte'
import type { OpenApiSchema } from '#lib/bits/pages/docs/components/releaseSchema/releaseSchema.types.js'

type Props = {
  family: string
  sourceReleaseCode: string
  resourceType: string
  source: string
  sourceSchemaUrl?: string | null
  sourceSchemaVersion?: string | null
  sourceVersion: string
}

let {
  family,
  sourceReleaseCode,
  resourceType,
  source,
  sourceSchemaUrl,
  sourceSchemaVersion,
  sourceVersion,
}: Props = $props()
let expandedNodeStates = $state<Record<string, boolean>>({})
let expandAllToken = $state(0)
let retainedSchema = $state<OpenApiSchema | null>(null)
let loading = $state(false)
let loadError = $state(false)

$effect(() => {
  retainedSchema = null
  loadError = false
  if (sourceSchema) return
  const controller = new AbortController()
  const base = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
    /\/+$/,
    '',
  )
  const url = new URL(`${base}/${family}/v0.1/source-schema`)
  url.searchParams.set('sourceRelease', sourceReleaseCode)
  loading = true
  void fetch(url, { signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error(`Schema request failed: ${response.status}`)
      const schema = (await response.json()) as OpenApiSchema
      if (!controller.signal.aborted) retainedSchema = schema
    })
    .catch(() => {
      if (!controller.signal.aborted) loadError = true
    })
    .finally(() => {
      if (!controller.signal.aborted) loading = false
    })
  return () => controller.abort()
})

let samplesUrl = $derived(`${page.url.pathname}?tab=samples`)
let sourceSchema = $derived(
  resolveSourceRecordSchema({
    resourceType: resourceType as ResourceType,
    source,
    sourceVersion,
  }),
)

function sourceFieldSchema(
  sourceSchema: SourceRecordSchema,
  field: SourceRecordSchemaField,
): OpenApiSchema {
  const definition = resolveOvertureSourceRecordFieldDefinition(sourceSchema, field)
  const type = field.type
  const sourceTypeDescription = m.source_record_schema_field_type({ type })

  switch (type) {
    case 'utf8':
      return {
        ...definition,
        description: [definition?.description, sourceTypeDescription]
          .filter(Boolean)
          .join(' '),
        type: 'string',
      }
    case 'int_32':
      return {
        ...definition,
        description: [definition?.description, sourceTypeDescription]
          .filter(Boolean)
          .join(' '),
        format: 'int32',
        type: 'integer',
      }
    case 'double':
      return {
        ...definition,
        description: [definition?.description, sourceTypeDescription]
          .filter(Boolean)
          .join(' '),
        format: 'double',
        type: 'number',
      }
    case 'boolean':
      return {
        ...definition,
        description: [definition?.description, sourceTypeDescription]
          .filter(Boolean)
          .join(' '),
        type: 'boolean',
      }
    case 'list':
      return {
        ...definition,
        description: [definition?.description, sourceTypeDescription]
          .filter(Boolean)
          .join(' '),
        items: definition?.items ?? { type: 'object' },
        type: 'array',
      }
    case 'map':
      return {
        ...definition,
        additionalProperties: definition?.additionalProperties ?? true,
        description: [definition?.description, sourceTypeDescription]
          .filter(Boolean)
          .join(' '),
        type: 'object',
      }
    default:
      return {
        ...definition,
        description: [definition?.description, sourceTypeDescription]
          .filter(Boolean)
          .join(' '),
        type: definition?.type ?? 'object',
      }
  }
}

let recordSchema = $derived.by((): OpenApiSchema | null => {
  if (!sourceSchema && !retainedSchema) return null

  const rawProperties: OpenApiSchema = sourceSchema
    ? {
        description: m.source_record_schema_raw_properties_description(),
        properties: Object.fromEntries(
          sourceSchema.fields.map(field => [
            field.name,
            {
              ...sourceFieldSchema(sourceSchema, field),
              nullable: field.nullable,
            },
          ]),
        ),
        type: 'object',
      }
    : { ...retainedSchema, description: m.source_record_schema_retained_description() }

  return {
    description: m.source_record_schema_record_description(),
    properties: {
      sourceRecordId: {
        description: m.source_record_schema_source_record_id_description(),
        type: 'string',
      },
      resourceType: {
        description: m.source_record_schema_resource_type_description(),
        type: 'string',
      },
      variant: {
        description: m.source_record_schema_variant_description(),
        type: 'string',
      },
      rawProperties: { ...rawProperties, nullable: true },
      geometry: {
        description: m.source_record_schema_geometry_description(),
        type: 'object',
      },
    },
    required: ['sourceRecordId', 'resourceType', 'variant', 'rawProperties'],
    type: 'object',
  }
})

function setExpandedNodeState(path: string, expanded: boolean) {
  expandedNodeStates = { ...expandedNodeStates, [path]: expanded }
}
</script>

<section class="space-y-4" aria-label={m.source_record_schema_aria_label()}>
  <p class="font-body text-body-md leading-relaxed text-foreground-alt">
    {m.source_record_schema_intro()}
  </p>

  <p class="font-body text-body-md leading-relaxed text-foreground-alt">
    {m.source_record_schema_not_one_to_one_before()} <code>rawProperties</code>
    {m.source_record_schema_not_one_to_one_after()}
  </p>

  <p class="font-body text-body-md leading-relaxed text-foreground-alt">
    {#if sourceSchemaUrl}
      {m.source_record_schema_upstream_specification()}
      <a
        class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
        href={sourceSchemaUrl}
        >{m.source_record_schema_upstream_specification_link({
          version: sourceSchemaVersion ?? 'latest',
        })}</a
      >.
    {/if}
    {m.source_record_schema_examples()}
    <a
      class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
      href={samplesUrl}
      >{m.source_record_schema_samples_tab()}</a
    >.
  </p>

  {#if recordSchema}
    <div
      class="overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
    >
      <Node
        {expandAllToken}
        {expandedNodeStates}
        name="SourceRecord"
        onExpandAll={() => (expandAllToken += 1)}
        onExpandedNodeStateChange={setExpandedNodeState}
        referencePath={['SourceRecord']}
        schema={recordSchema}
        schemas={{}}
      />
    </div>
  {:else if loading}
    <p class="font-body text-body-md text-foreground-alt" role="status">
      {m.source_record_schema_loading()}
    </p>
  {:else if loadError}
    <p class="font-body text-body-md text-error" role="alert">
      {m.source_record_schema_load_error()}
    </p>
  {:else}
    <p class="font-body text-body-md text-foreground-alt">
      {m.source_record_schema_unavailable()}
    </p>
  {/if}
</section>
