<script lang="ts">
import { flip } from 'svelte/animate'
import { untrack } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
import { fade } from 'svelte/transition'
import {
  getSchemaComposition,
  getSchemaDataArrayEnvelope,
  getSchemaRecordValueSchema,
  getSchemaReferenceName,
  getScalarArrayChain,
  getSchemaVariantName,
  isSchemaNullable,
} from '../releaseSchema.presentation'
import type { OpenApiSchema } from '../releaseSchema.types'
import InlineMarkdown from './releaseSchemaInlineMarkdown.svelte'
import ReleaseSchemaNode from './releaseSchemaNode.svelte'

type Props = {
  depth?: number
  expandAllToken?: number
  expandedNodeStates?: Readonly<Record<string, boolean>>
  name: string
  onExpandAll?: () => void
  onExpandedNodeStateChange?: (path: string, expanded: boolean) => void
  referencePath?: string[]
  required?: boolean
  schema: OpenApiSchema
  schemas: Record<string, OpenApiSchema>
}

let {
  depth = 0,
  expandAllToken = 0,
  expandedNodeStates = {},
  name,
  onExpandAll,
  onExpandedNodeStateChange,
  referencePath = [],
  required = false,
  schema,
  schemas,
}: Props = $props()

let ownReferenceName = $derived(getSchemaReferenceName(schema.$ref))
let directComposition = $derived(getSchemaComposition(schema))
let compositionReferenceName = $derived(
  (() => {
    const referenceNames = directComposition
      .map(member => getSchemaReferenceName(member.$ref))
      .filter((name): name is string => Boolean(name))
    return referenceNames.length === 1 ? referenceNames[0] : null
  })(),
)
let referenceName = $derived(ownReferenceName ?? compositionReferenceName)
let resolvedSchema = $derived(referenceName ? schemas[referenceName] : undefined)
let displaySchema = $derived(resolvedSchema ?? schema)
let dataArrayEnvelope = $derived(getSchemaDataArrayEnvelope(displaySchema, schemas))
let childSchema = $derived(dataArrayEnvelope?.itemSchema ?? displaySchema)
let properties = $derived(Object.entries(childSchema.properties ?? {}))
let isCyclicReference = $derived(
  Boolean(referenceName && referencePath.includes(referenceName)),
)
let childReferencePath = $derived(
  referenceName ? [...referencePath, referenceName] : referencePath,
)
let additionalProperties = $derived(
  typeof childSchema.additionalProperties === 'object'
    ? childSchema.additionalProperties
    : undefined,
)
let recordValueSchema = $derived(getSchemaRecordValueSchema(childSchema, schemas))
let visibleProperties = $derived(properties)
let composition = $derived(getSchemaComposition(childSchema))
let nullable = $derived(isSchemaNullable(schema) || isSchemaNullable(displaySchema))
let scalarArrayChain = $derived(getScalarArrayChain(displaySchema))
let typeLabel = $derived.by(() => {
  if (!ownReferenceName && referenceName) return referenceName

  const type = displaySchema.type
  const base = Array.isArray(type)
    ? type.filter(value => value !== 'null').join(' | ')
    : type
  const reference = ownReferenceName ? ` · ${ownReferenceName}` : ''
  return `${base || (composition.length ? 'union' : 'object')}${reference}`
})
let detailLabels = $derived([
  ...(displaySchema.format ? [displaySchema.format] : []),
  ...(displaySchema.pattern ? ['Pattern'] : []),
  ...(displaySchema.minLength !== undefined
    ? [`min length: ${displaySchema.minLength}`]
    : []),
  ...(displaySchema.maxLength !== undefined
    ? [`max length: ${displaySchema.maxLength}`]
    : []),
])
let description = $derived(
  [
    schema.description,
    ...directComposition.map(member => member.description),
    displaySchema.description,
    scalarArrayChain?.description,
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, descriptions) => descriptions.indexOf(value) === index)
    .join(' '),
)
let hasChildren = $derived(
  !isCyclicReference &&
    Boolean(
      visibleProperties.length ||
        additionalProperties ||
        composition.length ||
        (displaySchema.items && !scalarArrayChain && !dataArrayEnvelope),
    ),
)
let nodePath = $derived([...referencePath, name].join('.'))
let expanded = $state(untrack(() => expandedNodeStates[nodePath] ?? depth === 0))
let appliedExpandAllToken = $state(0)

$effect(() => {
  if (expandAllToken <= appliedExpandAllToken) return
  appliedExpandAllToken = expandAllToken
  if (!hasChildren) return

  expanded = true
  onExpandedNodeStateChange?.(nodePath, true)
})

function toggleExpanded() {
  expanded = !expanded
  onExpandedNodeStateChange?.(nodePath, expanded)
}
</script>

<div class:border-t={depth > 0} class="border-outline-variant/55">
  <div
    class="grid min-w-0 grid-cols-[minmax(9rem,0.32fr)_minmax(0,1fr)] gap-x-5 gap-y-2 py-4 pr-4"
    style:padding-left={`${1 + depth * 1.25}rem`}
  >
    <div class="flex min-w-0 items-start gap-2">
      {#if hasChildren}
        <button
          class="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-outline-variant/70 font-mono text-caption text-primary transition hover:border-secondary hover:text-secondary focus-visible:outline-2 focus-visible:outline-secondary"
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
          onclick={toggleExpanded}
        >
          {expanded ? '−' : '+'}
        </button>
      {:else}
        <span class="mt-0.5 size-5 shrink-0" aria-hidden="true"></span>
      {/if}
      <span
        class="min-w-0 font-mono text-label-md font-semibold text-primary wrap-break-word"
        >{name}</span
      >
    </div>

    <div class="min-w-0 space-y-2">
      <div class="flex items-start justify-between gap-4">
        <div class="flex flex-wrap items-center gap-2">
          {#if scalarArrayChain}
            {#each scalarArrayChain.types as type, index (`${type}-${index}`)}
              {#if index}
                <span class="font-body text-caption text-foreground-alt">of</span>
              {/if}
              <span
                class="rounded-full border border-outline-variant/70 bg-surface-container-lowest px-2.5 py-1 font-mono text-caption text-foreground-alt"
                >{type}</span
              >
            {/each}
          {:else if dataArrayEnvelope}
            <span
              class="rounded-full border border-outline-variant/70 bg-surface-container-lowest px-2.5 py-1 font-mono text-caption text-foreground-alt"
              >{typeLabel}</span
            >
            <span class="font-mono text-caption text-foreground-alt">.data with</span>
            <span
              class="rounded-full border border-outline-variant/70 bg-surface-container-lowest px-2.5 py-1 font-mono text-caption text-foreground-alt"
              >array</span
            >
            <span class="font-body text-caption text-foreground-alt">of</span>
            <span
              class="rounded-full border border-outline-variant/70 bg-surface-container-lowest px-2.5 py-1 font-mono text-caption text-foreground-alt"
              >{dataArrayEnvelope.itemType}</span
            >
          {:else}
            <span
              class="rounded-full border border-outline-variant/70 bg-surface-container-lowest px-2.5 py-1 font-mono text-caption text-foreground-alt"
              >{typeLabel}</span
            >
          {/if}
          {#if required}
            <span
              class="rounded-full bg-secondary-container px-2.5 py-1 font-body text-caption font-semibold text-on-secondary-container"
              >Required</span
            >
          {/if}
          {#if nullable}
            <span
              class="rounded-full bg-orange-400 px-2.5 py-1 font-body text-caption font-semibold text-black"
              >Nullable</span
            >
          {/if}
          {#if detailLabels.length}
            <span class="font-body text-caption text-foreground-alt"
              >{detailLabels.join(' · ')}</span
            >
          {/if}
        </div>
        {#if onExpandAll}
          <button
            class="shrink-0 rounded-sm border border-outline-variant/70 bg-surface-container-lowest px-2.5 py-1 font-mono text-caption font-semibold text-secondary transition hover:border-secondary focus-visible:outline-2 focus-visible:outline-secondary"
            type="button"
            onclick={onExpandAll}
          >
            Expand all
          </button>
        {/if}
      </div>
      {#if description}
        <p class="max-w-3xl font-body text-body-sm leading-relaxed text-foreground-alt">
          <InlineMarkdown value={description} />
        </p>
      {/if}
      {#if displaySchema.enum?.length}
        <p class="font-mono text-caption text-foreground-alt">
          {displaySchema.enum.map(value => JSON.stringify(value)).join(' | ')}
        </p>
      {:else if displaySchema.const !== undefined}
        <p class="font-mono text-caption text-foreground-alt">
          {JSON.stringify(displaySchema.const)}
        </p>
      {/if}
    </div>
  </div>

  {#if expanded && hasChildren}
    <div class="border-t border-outline-variant/55 bg-surface-container-low/60">
      {#each visibleProperties as [propertyName, propertySchema] (propertyName)}
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
            referencePath={childReferencePath}
            required={recordValueSchema?.required?.includes(propertyName) ?? childSchema.required?.includes(propertyName)}
            schema={propertySchema}
            {schemas}
          />
        </div>
      {/each}
      {#if additionalProperties}
        <div
          in:fade={{ duration: prefersReducedMotion.current ? 0 : 160 }}
          out:fade={{ duration: prefersReducedMotion.current ? 0 : 160 }}
        >
          <ReleaseSchemaNode
            depth={depth + 1}
            {expandAllToken}
            {expandedNodeStates}
            name={recordValueSchema
                ? childSchema['x-recordKeyName'] ?? 'property key'
                : childSchema['x-additionalPropertiesName'] ?? 'additional properties'}
            {onExpandedNodeStateChange}
            referencePath={childReferencePath}
            schema={additionalProperties}
            {schemas}
          />
        </div>
      {/if}
      {#each composition as member, index (`${name}-${index}`)}
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
            referencePath={childReferencePath}
            schema={member}
            {schemas}
          />
        </div>
      {/each}
      {#if displaySchema.items && !scalarArrayChain && !dataArrayEnvelope}
        <div
          in:fade={{ duration: prefersReducedMotion.current ? 0 : 160 }}
          out:fade={{ duration: prefersReducedMotion.current ? 0 : 160 }}
        >
          <ReleaseSchemaNode
            depth={depth + 1}
            {expandAllToken}
            {expandedNodeStates}
            name="items"
            {onExpandedNodeStateChange}
            referencePath={childReferencePath}
            schema={displaySchema.items}
            {schemas}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>
