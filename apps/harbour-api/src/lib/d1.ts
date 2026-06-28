export function withPrimarySession<TBinding>(binding: TBinding): TBinding {
  if (
    binding &&
    typeof binding === 'object' &&
    'withSession' in binding &&
    typeof binding.withSession === 'function'
  ) {
    return binding.withSession('first-primary') as TBinding
  }

  return binding
}
