<script lang="ts">
import { getCurrentLocale } from '#lib/bits/internal/i18n.js'
import GuideReference from '#lib/bits/pages/guides/components/shared/guideReference.svelte'

let { apiFamily }: { apiFamily: string } = $props()
let locale = $derived(getCurrentLocale())
</script>

<div class="space-y-3">
  <p class="leading-relaxed">
    This
    <GuideReference
      href={`saanseoi:${locale.toLowerCase()}:definition/schema/v1`}
      label="schema"
    />
    describes the resource objects returned in the <code>data</code> array when you make
    a request to the {apiFamily} API. It describes the selected response profile;
    <code>profile</code>
    changes that resource shape for particular use cases.
  </p>
  <p>
    The full response wraps those resources in
    <a
      class="font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
      href="https://jsonapi.org/"
      rel="noreferrer"
      target="_blank"
      >JSON:API</a
    >
    . Its <code>meta</code> keys provide extra context about the response, such as
    pagination details, while its <code>links</code> keys give you URLs for this
    response, other pages of results, or related resources. This keeps resources,
    relationships, pagination and links in one predictable format across API families.
  </p>
</div>
