<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'

import GuideExpandablePattern from '../../components/shared/guideExpandablePattern.svelte'

type Props = {
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

let { expanded = $bindable(true), onExpandedChange }: Props = $props()
</script>

<GuideExpandablePattern
  bind:expanded
  contentId="agentic-ai-primer-content"
  bannerLabel="AGENTIC AI PRIMER"
  bannerPrompt="$ make a map --together_"
  {onExpandedChange}
  title={m.guide_agentic_ai_primer_title()}
>
  <div class="agentic-ai-primer__hero">
    <div>
      <p class="agentic-ai-primer__eyebrow">01 / Two ways to work with an LLM</p>
      <p class="mt-3 max-w-xl font-body text-body-md leading-7 text-foreground-alt">
        {@html m.guide_agentic_ai_primer_description()}
      </p>
    </div>

    <div class="agentic-ai-primer__comparison">
      <article>
        <Icon
          class="agentic-ai-primer__comparison-icon"
          icon="material-symbols-light:forum-outline-rounded"
          aria-hidden="true"
        />
        <h4>{@html m.guide_agentic_ai_primer_web_title()}</h4>
        <p>{@html m.guide_agentic_ai_primer_web_description()}</p>
      </article>
      <article>
        <Icon
          class="agentic-ai-primer__comparison-icon"
          icon="material-symbols-light:smart-toy-outline"
          aria-hidden="true"
        />
        <h4>{@html m.guide_agentic_ai_primer_agent_title()}</h4>
        <p>{@html m.guide_agentic_ai_primer_agent_description()}</p>
      </article>
    </div>
  </div>

  <div class="agentic-ai-primer__dimensions">
    <div class="agentic-ai-primer__dimension-header" aria-hidden="true">
      <span></span>
      <span>{@html m.guide_agentic_ai_primer_web_title()}</span>
      <span>{@html m.guide_agentic_ai_primer_agent_title()}</span>
    </div>
    <dl class="agentic-ai-primer__dimension-list">
      <div class="agentic-ai-primer__dimension">
        <dt>{@html m.guide_agentic_ai_primer_comparison_setup()}</dt>
        <dd data-option={m.guide_agentic_ai_primer_web_title()}>
          {@html m.guide_agentic_ai_primer_comparison_web_setup()}
        </dd>
        <dd data-option={m.guide_agentic_ai_primer_agent_title()}>
          {@html m.guide_agentic_ai_primer_comparison_agent_setup()}
        </dd>
      </div>
      <div class="agentic-ai-primer__dimension">
        <dt>{@html m.guide_agentic_ai_primer_comparison_workflow()}</dt>
        <dd
          class="agentic-ai-primer__workflow"
          data-option={m.guide_agentic_ai_primer_web_title()}
        >
          <span>{@html m.guide_agentic_ai_primer_workflow_prompt()}</span>
          <Icon
            icon="material-symbols-light:arrow-forward-rounded"
            aria-hidden="true"
          />
          <span>{@html m.guide_agentic_ai_primer_workflow_answer()}</span>
          <Icon
            icon="material-symbols-light:arrow-forward-rounded"
            aria-hidden="true"
          />
          <span>{@html m.guide_agentic_ai_primer_workflow_copy_paste()}</span>
          <Icon
            icon="material-symbols-light:arrow-forward-rounded"
            aria-hidden="true"
          />
          <span>{@html m.guide_agentic_ai_primer_workflow_manual_edit_run()}</span>
          <Icon
            icon="material-symbols-light:arrow-forward-rounded"
            aria-hidden="true"
          />
          <span>{@html m.guide_agentic_ai_primer_workflow_copy_paste()}</span>
          <Icon
            class="agentic-ai-primer__workflow-loop"
            icon="material-symbols-light:replay-rounded"
            aria-hidden="true"
          />
        </dd>
        <dd
          class="agentic-ai-primer__workflow"
          data-option={m.guide_agentic_ai_primer_agent_title()}
        >
          <span>{@html m.guide_agentic_ai_primer_workflow_prompt()}</span>
          <Icon
            icon="material-symbols-light:arrow-forward-rounded"
            aria-hidden="true"
          />
          <span>{@html m.guide_agentic_ai_primer_workflow_execute_explain()}</span>
          <Icon
            class="agentic-ai-primer__workflow-loop"
            icon="material-symbols-light:replay-rounded"
            aria-hidden="true"
          />
        </dd>
      </div>
      <div class="agentic-ai-primer__dimension">
        <dt>{@html m.guide_agentic_ai_primer_comparison_cost()}</dt>
        <dd data-option={m.guide_agentic_ai_primer_web_title()}>
          {@html m.guide_agentic_ai_primer_comparison_web_cost()}
        </dd>
        <dd data-option={m.guide_agentic_ai_primer_agent_title()}>
          {@html m.guide_agentic_ai_primer_comparison_agent_cost()}
        </dd>
      </div>
      <div class="agentic-ai-primer__dimension">
        <dt>{@html m.guide_agentic_ai_primer_comparison_recommendation()}</dt>
        <dd data-option={m.guide_agentic_ai_primer_web_title()}>
          {@html m.guide_agentic_ai_primer_comparison_web_recommendation()}
        </dd>
        <dd
          class="agentic-ai-primer__recommendation"
          data-option={m.guide_agentic_ai_primer_agent_title()}
        >
          {@html m.guide_agentic_ai_primer_comparison_agent_recommendation()}
        </dd>
      </div>
    </dl>
  </div>
</GuideExpandablePattern>

<style>
.agentic-ai-primer__eyebrow,
.agentic-ai-primer__comparison p {
  margin: 0;
}
.agentic-ai-primer__eyebrow {
  display: block;
  margin-bottom: 0.45rem;
  color: var(--color-secondary);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.agentic-ai-primer__hero {
  display: grid;
  gap: 2rem;
  align-items: start;
}
.agentic-ai-primer__comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
}
.agentic-ai-primer__comparison article {
  min-width: 0;
}
:global(.agentic-ai-primer__comparison-icon) {
  width: 3rem;
  height: 3rem;
  color: var(--color-secondary);
}
.agentic-ai-primer__comparison h4 {
  margin: 0.7rem 0 0;
  color: var(--color-primary);
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
}
.agentic-ai-primer__comparison p,
.agentic-ai-primer__dimension dd {
  margin-top: 0.45rem;
  color: var(--color-foreground-alt);
  font-family: var(--font-body);
  font-size: 0.875rem;
  line-height: 1.55;
}
.agentic-ai-primer__dimensions {
  margin-top: 2.5rem;
  border-top: 1px solid color-mix(in srgb, var(--color-secondary) 45%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-secondary) 45%, transparent);
}
.agentic-ai-primer__dimension-list {
  margin: 0;
}
.agentic-ai-primer__dimension-header,
.agentic-ai-primer__dimension {
  display: grid;
  grid-template-columns: minmax(7rem, 0.7fr) repeat(2, minmax(0, 1fr));
}
.agentic-ai-primer__dimension-header {
  color: var(--color-secondary);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.agentic-ai-primer__dimension-header span,
.agentic-ai-primer__dimension dt,
.agentic-ai-primer__dimension dd {
  padding: 0.85rem 1rem;
}
.agentic-ai-primer__dimension-header span:not(:first-child),
.agentic-ai-primer__dimension dd {
  border-left: 1px solid color-mix(in srgb, var(--color-secondary) 30%, transparent);
}
.agentic-ai-primer__dimension {
  border-top: 1px solid color-mix(in srgb, var(--color-secondary) 30%, transparent);
}
.agentic-ai-primer__dimension dt,
.agentic-ai-primer__dimension dd {
  margin: 0;
}
.agentic-ai-primer__dimension dt {
  color: var(--color-primary);
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 700;
}
.agentic-ai-primer__dimension dd {
  font-size: 0.8rem;
}
.agentic-ai-primer__dimension dd.agentic-ai-primer__workflow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-secondary);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.25;
}
.agentic-ai-primer__workflow span {
  border: 1px solid color-mix(in srgb, var(--color-secondary) 45%, transparent);
  background: color-mix(in srgb, var(--color-secondary-container) 38%, transparent);
  padding: 0.2rem 0.35rem;
  white-space: nowrap;
}
:global(.agentic-ai-primer__workflow svg) {
  width: 0.85rem;
  height: 0.85rem;
  flex: none;
}
:global(.agentic-ai-primer__workflow .agentic-ai-primer__workflow-loop) {
  width: 1rem;
  height: 1rem;
}
.agentic-ai-primer__dimension dd.agentic-ai-primer__recommendation {
  color: var(--color-secondary);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
@media (min-width: 768px) {
  .agentic-ai-primer__hero {
    grid-template-columns: minmax(0, 1.15fr) minmax(15rem, 0.85fr);
  }
}
@media (max-width: 767px) {
  .agentic-ai-primer__dimension-header {
    display: none;
  }
  .agentic-ai-primer__dimension {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .agentic-ai-primer__dimension dt {
    grid-column: 1 / -1;
    padding-bottom: 0.35rem;
  }
  .agentic-ai-primer__dimension dd {
    padding-top: 0.35rem;
  }
  .agentic-ai-primer__dimension dd.agentic-ai-primer__workflow {
    gap: 0.25rem;
    font-size: 0.58rem;
  }
  .agentic-ai-primer__workflow span {
    padding: 0.16rem 0.25rem;
  }
  .agentic-ai-primer__dimension dd::before {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--color-secondary);
    content: attr(data-option);
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
}
</style>
