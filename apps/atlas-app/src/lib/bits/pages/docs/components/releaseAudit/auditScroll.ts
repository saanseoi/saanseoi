export const auditScrollHasMore = ({
  clientHeight,
  scrollHeight,
  scrollTop,
}: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>) =>
  clientHeight > 0 && scrollHeight - scrollTop - clientHeight > 1

export const nextAuditScrollPage = ({
  clientHeight,
  scrollHeight,
  scrollTop,
}: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>) =>
  Math.min(scrollTop + clientHeight, Math.max(0, scrollHeight - clientHeight))
