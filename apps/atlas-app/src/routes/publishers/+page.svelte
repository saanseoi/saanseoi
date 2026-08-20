<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import * as PublishersPage from '#lib/bits/pages/publishers/index.js'
import type { PublisherDirectoryItem } from '#lib/bits/pages/publishers/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'

let { data } = $props()
let publishersPageData = $derived(data.publishersPageData)
</script>

<Seo title={m.publishers_title()} description={m.publishers_meta_description()} />

<Main variant="page" class="py-14">
  <PublishersPage.Directory.Header />
  <PublishersPage.Directory.Grid
    publishers={publishersPageData.publishers as PublisherDirectoryItem[]}
  />
</Main>
