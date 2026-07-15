import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = ({ locals }) => ({
  user: locals.user
    ? {
        email: locals.user.email,
        image: locals.user.image,
        name: locals.user.name,
      }
    : null,
})
