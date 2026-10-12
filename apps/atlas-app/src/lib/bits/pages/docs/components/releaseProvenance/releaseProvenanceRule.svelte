<script lang="ts">
import SourceSelection from './releaseProvenanceSelection.svelte'
import FieldReference from './releaseProvenanceRuleReference.svelte'
import Rule from './releaseProvenanceRule.svelte'
import type { HumanOperation } from '@repo/db/fieldLineageHuman'
let { rule }: { rule: NonNullable<HumanOperation['rule']> } = $props()
</script>
{#if rule.kind === 'source-selection'}
  <SourceSelection {rule} />
{:else if rule.kind === 'sections'}
  <div class="space-y-2">
    {#each rule.sections as section, index}
      {#if section.rule.kind === 'field-reference'}
        <FieldReference rule={section.rule} />
      {:else if rule.layout === 'flow' || rule.layout === 'cases'}
        <section class="space-y-2 not-first:mt-5">
          {#if index && rule.layout === 'flow'}
            <div aria-hidden="true" class="pl-2 text-foreground/40">↓</div>
          {/if}
          <h5 class="font-semibold">
            <span class="mr-2 font-mono text-foreground/50">{index + 1}</span>
            {section.title}
          </h5>
          {#if section.description}
            <p class="text-foreground/60">{section.description}</p>
          {/if}
          <Rule rule={section.rule} />
        </section>
      {:else}
        <details class="rounded-md border border-foreground/15">
          <summary class="cursor-pointer px-3 py-2 font-semibold text-foreground">
            {section.title}
          </summary>
          <div class="space-y-2 px-3 pb-3">
            <p class="leading-relaxed text-foreground/65">{section.description}</p>
            <Rule rule={section.rule} />
          </div>
        </details>
      {/if}
    {/each}
  </div>
{:else if rule.kind === 'field-reference'}
  <FieldReference {rule} />
{:else if rule.kind === 'mapping'}
  <table
    class="w-full table-fixed text-left text-xs"
    aria-label="Field derivation rules"
  >
    <thead>
      <tr>
        {#each rule.columns as column}
          <th
            class="border-b border-foreground/20 py-2 pr-2 font-semibold text-foreground/70"
          >
            {column}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rule.rows as row}
        <tr>
          {#each row as cell, i}
            <td
              class="border-b border-foreground/10 py-2 pr-2 align-top leading-relaxed last:pr-0"
            >
              <span
                class={i === row.length - 1
                  ? 'font-medium text-foreground'
                  : 'text-foreground/75'}
                >{cell}</span
              >
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
{:else if rule.kind === 'priority'}
  <dl class="space-y-2" aria-label="Conditional derivation">
    {#each rule.branches as branch}
      <div
        class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] items-center gap-2 rounded-md bg-foreground/5 p-2.5 text-xs leading-relaxed"
      >
        <dt class="text-foreground/65">{branch.when}</dt>
        <span aria-hidden="true" class="self-center text-primary">→</span>
        <dd class="font-medium text-foreground/90">{branch.value}</dd>
        {#if branch.rule}
          <dd class="col-span-3">
            <details class="border-t border-foreground/10 pt-2">
              <summary class="cursor-pointer text-secondary">Show mapping</summary>
              <div class="space-y-2 pt-2">
                <Rule rule={branch.rule} />
                {#if branch.note}
                  <p class="text-foreground/60">{branch.note}</p>
                {/if}
              </div>
            </details>
          </dd>
        {/if}
      </div>
    {/each}
  </dl>
{:else}
  <ol class="text-xs" aria-label="Derivation sequence">
    {#each rule.steps as step, index}
      <li>
        {#if index}
          <span
            aria-hidden="true"
            class="flex h-6 items-center pl-3 leading-none text-primary"
            >↓</span
          >
        {/if}
        <span
          class="block rounded-md bg-foreground/5 px-3 py-2 leading-relaxed text-foreground/85"
          >{step}</span
        >
      </li>
    {/each}
  </ol>
{/if}
