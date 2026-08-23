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
  <div class="px-4 py-3">
    <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <span class="font-mono text-label-md font-semibold text-primary">{name}</span>
      <span class="font-body text-label-md text-foreground-alt">{typeLabel}</span>
      {#if required}
        <span class="font-body text-caption font-semibold text-secondary"
          >required</span
        >
      {/if}
    </div>

    {#if detailLabels.length}
      <p class="mt-1 font-body text-caption text-foreground-alt">
        {detailLabels.join(' · ')}
      </p>
    {/if}
    {#if displaySchema.description}
      <p class="mt-2 font-body text-body-sm leading-relaxed text-foreground-alt">
        {displaySchema.description}
      </p>
    {/if}
    {#if displaySchema.enum?.length}
      <p class="mt-2 font-mono text-caption text-foreground-alt">
        {displaySchema.enum.map(value => JSON.stringify(value)).join(' | ')}
      </p>
    {:else if displaySchema.const !== undefined}
      <p class="mt-2 font-mono text-caption text-foreground-alt">
        {JSON.stringify(displaySchema.const)}
      </p>
    {/if}

    {#if hasChildren}
      <button
        class="mt-3 rounded-full border border-outline-variant/70 px-3 py-1 font-mono text-caption font-semibold text-primary transition hover:border-secondary hover:text-secondary focus-visible:outline-2 focus-visible:outline-secondary"
        type="button"
        aria-expanded={expanded}
        onclick={() => (collapsed = !collapsed)}
      >
        {expanded ? '−' : '+'} {name}
      </button>
    {/if}
  </div>

  {#if expanded && hasChildren}
    <div class="border-t border-outline-variant/55 bg-surface-container-low">
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
