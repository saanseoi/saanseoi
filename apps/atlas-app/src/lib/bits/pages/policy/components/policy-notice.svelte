<script lang="ts">
type Props = {
  title?: string
}

let { title = 'Language notice' }: Props = $props()
</script>

<aside
  class="policy-notice rounded-[1.6rem] border border-secondary/18 bg-secondary-container/78 p-5 shadow-mini md:p-6"
>
  <p
    class="font-display text-[1.02rem] leading-tight font-bold tracking-headline-lg text-on-secondary-container"
  >
    {title}
  </p>

  <div
    class="mt-3 space-y-3 font-body text-[0.95rem] leading-[1.75] text-on-secondary-container"
  >
    <p>
      The English version appears first. A Traditional Chinese version is provided after
      the English version for convenience. If there is any inconsistency or conflict
      between the two versions, the English version prevails.
    </p>
    <p>
      英文版本先列，繁體中文版本隨後提供，以便參考。如兩個版本之間有任何不一致或衝突，概以英文版本為準。
    </p>
  </div>
</aside>

<style>
.policy-notice {
  backdrop-filter: blur(10px);
}
</style>
