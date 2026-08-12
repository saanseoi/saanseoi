export const socialProviders = [
  { id: 'google', icon: 'ion:logo-google' },
  { id: 'facebook', icon: 'ion:logo-facebook' },
  { id: 'github', icon: 'ion:logo-github' },
] as const

export type SocialProvider = (typeof socialProviders)[number]['id']
