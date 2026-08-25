<script lang="ts">
import {
  resolveSourceRecordSchema,
  type ResourceType,
} from '@repo/core/sourceRecordSchemas'
import { page } from '$app/state'

import { m } from '#lib/bits/internal/i18n.js'
import Node from '#lib/bits/pages/docs/components/releaseSchema/components/releaseSchemaNode.svelte'
import type { OpenApiSchema } from '#lib/bits/pages/docs/components/releaseSchema/releaseSchema.types.js'

type Props = {
  resourceType: string
  source: string
  sourceSchemaVersion?: string | null
  sourceVersion: string
}

let { resourceType, source, sourceSchemaVersion, sourceVersion }: Props = $props()
let expandedNodeStates = $state<Record<string, boolean>>({})
let expandAllToken = $state(0)

let samplesUrl = $derived(`${page.url.pathname}?tab=samples`)
let sourceSchema = $derived(
  resolveSourceRecordSchema({
    resourceType: resourceType as ResourceType,
    source,
    sourceVersion,
  }),
)

function sourceFieldSchema(type: string): OpenApiSchema {
  switch (type) {
    case 'utf8':
      return { type: 'string' }
    case 'int_32':
      return { format: 'int32', type: 'integer' }
    case 'double':
      return { format: 'double', type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'list':
      return { items: { type: 'object' }, type: 'array' }
    case 'map':
      return { additionalProperties: true, type: 'object' }
    default:
      return { type: 'object' }
  }
}

let recordSchema = $derived.by((): OpenApiSchema | null => {
  if (!sourceSchema) return null

  const rawProperties: OpenApiSchema = {
    description: m.source_record_schema_raw_properties_description(),
    properties: Object.fromEntries(
      sourceSchema.fields.map(field => [
        field.name,
        {
          ...sourceFieldSchema(field.type),
          description: m
            .source_record_schema_field_type()
            .replace('{type}', field.type),
          nullable: field.nullable,
        },
      ]),
    ),
    type: 'object',
  }

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
    {m.source_record_schema_intro_before()} <code>rawProperties</code>
    {m.source_record_schema_intro_after()}
    {m.source_record_schema_upstream_specification()}
    {#if sourceSchemaVersion}
      <code>({sourceSchemaVersion})</code>
    {/if}
    {m.source_record_schema_available_in()}
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
  {:else}
    <p class="font-body text-body-md text-foreground-alt">
      {m.source_record_schema_unavailable()}
    </p>
  {/if}
</section>
