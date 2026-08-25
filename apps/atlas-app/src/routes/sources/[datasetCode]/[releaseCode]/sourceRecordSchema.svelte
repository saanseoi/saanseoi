<script lang="ts">
import { resolveSourceRecordSchema, type ResourceType } from '@repo/core'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'

import Node from '#lib/bits/pages/docs/components/releaseSchema/components/releaseSchemaNode.svelte'
import type { OpenApiSchema } from '#lib/bits/pages/docs/components/releaseSchema/releaseSchema.types.js'

type Props = {
  family: string
  resourceType: string
  source: string
  sourceReleaseCode: string
  sourceSchemaUrl?: string | null
  sourceSchemaVersion?: string | null
  sourceVersion: string
}

let {
  family,
  resourceType,
  source,
  sourceReleaseCode,
  sourceSchemaUrl,
  sourceSchemaVersion,
  sourceVersion,
}: Props = $props()
let expandedNodeStates = $state<Record<string, boolean>>({})
let expandAllToken = $state(0)

let apiBaseUrl = $derived(
  (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, ''),
)
let requestUrl = $derived(
  `${apiBaseUrl}/${family}/v0.1/sources?sourceRelease=${encodeURIComponent(sourceReleaseCode)}&include=geometry`,
)
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
    description:
      'The unmodified source payload for this record, validated against the release-specific source schema.',
    properties: Object.fromEntries(
      sourceSchema.fields.map(field => [
        field.name,
        {
          ...sourceFieldSchema(field.type),
          description: `Overture source type: \`${field.type}\`.`,
          nullable: field.nullable,
        },
      ]),
    ),
    type: 'object',
  }

  return {
    description:
      'A raw record from this published source release. `rawProperties` is typed to the exact upstream schema selected at ingestion.',
    properties: {
      sourceRecordId: {
        description: 'Source-specific record identifier.',
        type: 'string',
      },
      resourceType: {
        description: 'SaanSeoi resource type represented by the source record.',
        type: 'string',
      },
      variant: {
        description: 'Source variant retained with the record.',
        type: 'string',
      },
      rawProperties: { ...rawProperties, nullable: true },
      geometry: {
        description:
          'GeoJSON geometry, returned only when `include=geometry` is requested.',
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

<section class="space-y-4" aria-label="Source record schema">
  <p class="font-body text-body-md leading-relaxed text-foreground-alt">
    This schema describes the raw source records returned for this exact release. The
    typed <code>rawProperties</code> object is the payload stored from Overture, before
    SaanSeoi's canonical transformation.
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
      The typed source schema is not available for this release yet.
    </p>
  {/if}

  <p class="font-body text-body-md text-foreground-alt">
    <a
      class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
      href={requestUrl}
      target="_blank"
      rel="noreferrer"
      >Open the typed source-record response</a
    >.
    {#if sourceSchemaUrl}
      The upstream schema{sourceSchemaVersion ? ` (${sourceSchemaVersion})` : ''}
      is
      <a
        class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
        href={sourceSchemaUrl}
        target="_blank"
        rel="noreferrer"
        >also available</a
      >.
    {/if}
  </p>
</section>
