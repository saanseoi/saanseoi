<script lang="ts">
import Rule from './releaseProvenanceRule.svelte'
import type { HumanOperation } from '@repo/db/fieldLineageHuman'
let { rule }: { rule: NonNullable<HumanOperation['rule']> } = $props()
</script>
{#if rule.kind === 'sections'}
  <div class="space-y-2">
    {#each rule.sections as section}
      <details class="rounded-md border border-foreground/15">
        <summary class="cursor-pointer px-3 py-2 font-semibold text-foreground">
          {section.title}
        </summary>
        <div class="space-y-2 px-3 pb-3">
          <p class="leading-relaxed text-foreground/65">{section.description}</p>
          <Rule rule={section.rule} />
        </div>
      </details>
    {/each}
  </div>
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
        class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] items-start gap-2 rounded-md bg-foreground/5 p-2.5 text-xs leading-relaxed"
      >
        <dt class="text-foreground/65">{branch.when}</dt>
        <span aria-hidden="true" class="self-center text-primary">→</span>
        <dd class="font-medium text-foreground/90">{branch.value}</dd>
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
