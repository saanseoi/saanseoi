<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

type Props = {
  title?: string
  description?: string
  descriptionMaxWidth?: string
  titleId?: string
}

let {
  title = m.pipeline_title(),
  description = m.pipeline_description(),
  descriptionMaxWidth,
  titleId,
}: Props = $props()
</script>

<header class="landing-section-header block pb-6">
  <h2
    class="max-w-[15ch] font-display text-[clamp(2.25rem,4.05vw,4.2rem)] font-extrabold leading-[.92] text-primary"
    id={titleId}
  >
    {title}
  </h2>
  <p
    class="mt-4 max-w-240 font-body text-[clamp(1rem,1.4vw,1.14rem)] leading-[1.8] text-foreground-alt"
    style:max-width={descriptionMaxWidth}
  >
    {description}
  </p>
</header>
