<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { PageDescription, PageHeader, PageTitle } from '#lib/bits/pages/shared/index.js'
</script>

<PageHeader class="max-w-none">
  <PageTitle>{m.publishers_title()}</PageTitle>
  <PageDescription class="max-w-3xl">
    {m.publishers_description()}
  </PageDescription>
</PageHeader>
