<script lang="ts">
import { getSchemaReferenceName } from '../releaseSchema.presentation'
import type { OpenApiSchema } from '../releaseSchema.types'
import ReleaseSchemaNode from './releaseSchemaNode.svelte'

type Props = {
  depth?: number
  name: string
  referencePath?: string[]
  required?: boolean
  schema: OpenApiSchema
  schemas: Record<string, OpenApiSchema>
}

let {
  depth = 0,
  name,
  referencePath = [],
  required = false,
  schema,
  schemas,
}: Props = $props()

let referenceName = $derived(getSchemaReferenceName(schema.$ref))
let resolvedSchema = $derived(referenceName ? schemas[referenceName] : undefined)
let displaySchema = $derived(resolvedSchema ?? schema)
let properties = $derived(Object.entries(displaySchema.properties ?? {}))
let isCyclicReference = $derived(
  Boolean(referenceName && referencePath.includes(referenceName)),
)
let childReferencePath = $derived(
  referenceName ? [...referencePath, referenceName] : referencePath,
)
let additionalProperties = $derived(
  typeof displaySchema.additionalProperties === 'object'
    ? displaySchema.additionalProperties
    : undefined,
)
let composition = $derived(
  displaySchema.oneOf ?? displaySchema.anyOf ?? displaySchema.allOf ?? [],
)
let typeLabel = $derived.by(() => {
  const type = displaySchema.type
  const base = Array.isArray(type) ? type.join(' | ') : type
  const nullable = displaySchema.nullable && !Array.isArray(type)
  const reference = referenceName ? ` · ${referenceName}` : ''
  return `${base ?? (composition.length ? 'union' : 'object')}${reference}${nullable ? ' · nullable' : ''}`
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
let hasChildren = $derived(
  !isCyclicReference &&
    Boolean(
      properties.length ||
        additionalProperties ||
        composition.length ||
        displaySchema.items,
    ),
)
let collapsed = $state(false)
let expanded = $derived(depth === 0 ? !collapsed : collapsed)
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
          onclick={() => (collapsed = !collapsed)}
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
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="rounded-full border border-outline-variant/70 bg-surface-container-lowest px-2.5 py-1 font-mono text-caption text-foreground-alt"
          >{typeLabel}</span
        >
        {#if required}
          <span
            class="rounded-full bg-secondary-container px-2.5 py-1 font-body text-caption font-semibold text-on-secondary-container"
            >Required</span
          >
        {/if}
        {#if detailLabels.length}
          <span class="font-body text-caption text-foreground-alt"
            >{detailLabels.join(' · ')}</span
          >
        {/if}
      </div>
      {#if displaySchema.description}
        <p class="max-w-3xl font-body text-body-sm leading-relaxed text-foreground-alt">
          {displaySchema.description}
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
      {#each properties as [propertyName, propertySchema] (propertyName)}
        <ReleaseSchemaNode
          depth={depth + 1}
          name={propertyName}
          referencePath={childReferencePath}
          required={displaySchema.required?.includes(propertyName)}
          schema={propertySchema}
          {schemas}
        />
      {/each}
      {#if additionalProperties}
        <ReleaseSchemaNode
          depth={depth + 1}
          name="additional properties"
          referencePath={childReferencePath}
          schema={additionalProperties}
          {schemas}
        />
      {/if}
      {#each composition as member, index (`${name}-${index}`)}
        <ReleaseSchemaNode
          depth={depth + 1}
          name={`option ${index + 1}`}
          referencePath={childReferencePath}
          schema={member}
          {schemas}
        />
      {/each}
      {#if displaySchema.items}
        <ReleaseSchemaNode
          depth={depth + 1}
          name="items"
          referencePath={childReferencePath}
          schema={displaySchema.items}
          {schemas}
        />
      {/if}
    </div>
  {/if}
</div>
