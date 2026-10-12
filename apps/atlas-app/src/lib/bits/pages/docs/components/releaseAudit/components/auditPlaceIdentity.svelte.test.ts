import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'
import AuditFixture from './auditFixture.svelte'

test('identity disclosure shows old/new evidence, score and missing hours without implying review', async () => {
  const screen = await render(AuditFixture, {
    value: {
      entries: [
        {
          model: 'place-identity-v1',
          sourceRelease: '2026-09',
          id: 'canonical-id',
          sourceId: 'publisher-new',
          outcome: 'matched',
          reason: 'continuity',
          threshold: 85,
          requiredMargin: 15,
          alternativeMargin: null,
          rivalMargin: null,
          rivals: [],
          evidence: {
            sourceId: 'publisher-new',
            names: ['Example Cafe'],
            phones: ['+85223456789'],
            hours: null,
          },
          candidates: [
            {
              id: 'canonical-id',
              release: '2026-08',
              score: 100,
              distanceMetres: 3,
              eligible: true,
              agreements: ['phones', 'names'],
              conflicts: [],
              evidence: {
                sourceId: 'publisher-old',
                names: ['Example Cafe'],
                phones: ['+85223456789'],
                hours: null,
              },
            },
          ],
        },
      ],
    },
  })
  await screen.getByText('Example Cafe · ID reused · continuity').click()
  await expect
    .element(screen.getByText('Automatic decision', { exact: false }))
    .toBeVisible()
  await expect.element(screen.getByText('publisher-old', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('publisher-new', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Opening hours', { exact: true })).toBeVisible()
  await expect
    .element(screen.getByText('Unknown means missing evidence', { exact: false }))
    .toBeVisible()
  await expect
    .element(
      screen.getByText('Policy threshold: 85; required margin: 15.', { exact: false }),
    )
    .toBeVisible()
})
