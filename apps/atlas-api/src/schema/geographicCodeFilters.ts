import { z } from '@hono/zod-openapi'

export const geographicCodeClasses = {
  adminCode: ['sar', 'area', 'district'],
  localityCode: ['city', 'town', 'rural_area', 'village', 'hamlet'],
  hoodCode: ['macrohood', 'neighbourhood', 'microhood'],
  landformCode: ['major_island', 'minor_island', 'islet', 'island_group'],
} as const
export type GeographicCodeFilter = keyof typeof geographicCodeClasses
const code = z
  .string()
  .regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/)
  .optional()
export const geographicCodeQueryShape = {
  'filter[adminCode]': code,
  'filter[localityCode]': code,
  'filter[hoodCode]': code,
  'filter[landformCode]': code,
  geographicReleaseSet: z.string().min(1).optional().openapi({
    description:
      'Geographic release used to resolve code membership; defaults to the selected geographic release or latest compatible selection.',
  }),
}
export const GeographicCodeQuerySchema = z.object(geographicCodeQueryShape)
