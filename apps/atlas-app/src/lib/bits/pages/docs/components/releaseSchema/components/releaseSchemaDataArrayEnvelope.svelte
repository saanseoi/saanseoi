<script lang="ts">
import { flip } from 'svelte/animate'
import { prefersReducedMotion } from 'svelte/motion'
import { fade } from 'svelte/transition'
import {
  getSchemaComposition,
  getSchemaRecordValueSchema,
  getSchemaVariantName,
} from '../releaseSchema.presentation'
import type { OpenApiSchema } from '../releaseSchema.types'
import InlineMarkdown from './releaseSchemaInlineMarkdown.svelte'
import ReleaseSchemaNode from './releaseSchemaNode.svelte'

type Props = {
  depth: number
  expandAllToken: number
  expandedNodeStates: Readonly<Record<string, boolean>>
  itemSchema: OpenApiSchema
  itemType: string
  onExpandedNodeStateChange?: (path: string, expanded: boolean) => void
  referencePath: string[]
  required: boolean
  schema: OpenApiSchema
  schemas: Record<string, OpenApiSchema>
}

let {
  depth,
  expandAllToken,
  expandedNodeStates,
  itemSchema,
  itemType,
  onExpandedNodeStateChange,
  referencePath,
  required,
  schema,
  schemas,
}: Props = $props()

let properties = $derived(Object.entries(itemSchema.properties ?? {}))
let additionalProperties = $derived(
  typeof itemSchema.additionalProperties === 'object'
    ? itemSchema.additionalProperties
    : undefined,
)
let recordValueSchema = $derived(getSchemaRecordValueSchema(itemSchema, schemas))
let composition = $derived(getSchemaComposition(itemSchema))
</script>

<div
  class="mx-4 my-4 overflow-hidden rounded-md border border-outline-variant/70 bg-surface-container-lowest"
  style:margin-left={`${1 + depth * 1.25}rem`}
>
  <div
    class="grid min-w-0 grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-x-5 gap-y-2 px-4 py-3"
  >
    <span class="font-mono text-label-md font-semibold text-primary">data</span>
    <div class="min-w-0 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-outline-variant/70 bg-surface-container-low px-2.5 py-1 font-mono text-caption text-foreground-alt"
          >array</span
        >
        <span class="font-body text-caption text-foreground-alt">of</span>
        <span
          class="rounded-full border border-outline-variant/70 bg-surface-container-low px-2.5 py-1 font-mono text-caption text-foreground-alt"
          >{itemType}</span
        >
        {#if required}
          <span
            class="rounded-full bg-secondary-container px-2.5 py-1 font-body text-caption font-semibold text-on-secondary-container"
            >Required</span
          >
        {/if}
      </div>
      {#if schema.description}
        <p class="max-w-3xl font-body text-body-sm leading-relaxed text-foreground-alt">
          <InlineMarkdown value={schema.description} />
        </p>
      {/if}
    </div>
  </div>

  <div class="border-t border-outline-variant/55 bg-surface-container-low/60">
    {#each properties as [propertyName, propertySchema] (propertyName)}
      <div
        animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}
        in:fade={{ duration: prefersReducedMotion.current ? 0 : 160 }}
        out:fade={{ duration: prefersReducedMotion.current ? 0 : 160 }}
      >
        <ReleaseSchemaNode
          depth={depth + 1}
          {expandAllToken}
          {expandedNodeStates}
          name={propertyName}
          {onExpandedNodeStateChange}
          {referencePath}
          required={recordValueSchema?.required?.includes(propertyName) ?? itemSchema.required?.includes(propertyName)}
          schema={propertySchema}
          {schemas}
        />
      </div>
    {/each}
    {#if additionalProperties}
      <ReleaseSchemaNode
        depth={depth + 1}
        {expandAllToken}
        {expandedNodeStates}
        name={recordValueSchema
          ? itemSchema['x-recordKeyName'] ?? 'property key'
          : itemSchema['x-additionalPropertiesName'] ?? 'additional properties'}
        {onExpandedNodeStateChange}
        {referencePath}
        schema={additionalProperties}
        {schemas}
      />
    {/if}
    {#each composition as member, index (`data-${index}`)}
      <div
        animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}
        in:fade={{ duration: prefersReducedMotion.current ? 0 : 160 }}
        out:fade={{ duration: prefersReducedMotion.current ? 0 : 160 }}
      >
        <ReleaseSchemaNode
          depth={depth + 1}
          {expandAllToken}
          {expandedNodeStates}
          name={getSchemaVariantName(member) ?? `option ${index + 1}`}
          {onExpandedNodeStateChange}
          {referencePath}
          schema={member}
          {schemas}
        />
      </div>
    {/each}
  </div>
</div>
