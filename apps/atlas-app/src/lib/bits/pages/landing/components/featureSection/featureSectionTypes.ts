export type FeatureSectionAnimation = 'ticker' | 'growth' | 'provenance' | 'cubes'

export type FeatureSectionPrinciple = {
  title: () => string
  body: () => string
  tone: 'paper' | 'dark'
  animation: FeatureSectionAnimation
}
