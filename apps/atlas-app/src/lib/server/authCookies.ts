// Cookies are shared across ports on localhost. Keep SaanSeoi's authentication
// cookies separate from other applications using Better Auth's default names.
export const authCookieOptions = { cookiePrefix: 'saanseoi' } as const
