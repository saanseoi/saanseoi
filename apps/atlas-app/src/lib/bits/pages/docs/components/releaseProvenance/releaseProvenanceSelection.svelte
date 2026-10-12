<script lang="ts">
import Text from './releaseProvenanceText.svelte'
import type { HumanOperation } from '@repo/db/fieldLineageHuman'
let {
  rule,
}: {
  rule: Extract<NonNullable<HumanOperation['rule']>, { kind: 'source-selection' }>
} = $props()
</script>
<div class="space-y-3 text-xs">
  {#if rule.cases.length > 1}
    <p class="text-foreground/60">
      Separate uses of this source — apply the matching case.
    </p>
  {/if}
  {#each rule.cases as selection}
    <div class="rounded-md border border-foreground/15">
      <p class="border-b border-foreground/10 bg-foreground/5 px-3 py-2 font-medium">
        <span class="mr-1 text-foreground/60">Applies when</span>
        <Text text={selection.when} />
      </p>
      <div class="space-y-2 p-3">
        {#if selection.steps.length > 1}
          <p class="text-foreground/60">Follow in order</p>
        {/if}
        <ol class="space-y-3">
          {#each selection.steps as step, index}
            <li class="flex items-start gap-2">
              <span
                class="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 font-mono text-foreground/65"
                >{index + 1}</span
              >
              <div class="min-w-0 space-y-2 leading-relaxed">
                <p><Text text={step.action} /></p>
                {#if step.all}
                  <div class="border-l-2 border-secondary/40 pl-3">
                    <p class="mb-1 font-semibold text-secondary">All must match</p>
                    <ul class="space-y-1">
                      {#each step.all as condition}
                        <li><Text text={condition} /></li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      </div>
    </div>
  {/each}
</div>
