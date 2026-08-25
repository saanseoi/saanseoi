import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import GuideCreateAMapApiKeys from './guideCreateAMapApiKeys.svelte'

test('keeps .env instructions visible once an API key is ready', async () => {
  const screen = await render(GuideCreateAMapApiKeys, {
    apiKeyReady: true,
    editorLabel: 'VS Code',
    newFileShortcut: 'Ctrl+N',
  })

  await expect
    .element(screen.getByRole('heading', { name: 'Add your API key to the project' }))
    .toBeVisible()
  await expect
    .element(screen.getByText('VITE_SAANSEOI_API_KEY=REPLACE_ME_WITH_YOUR_API_KEY'))
    .toBeVisible()
  await expect.element(screen.getByText('$ ls -la')).toBeVisible()
  await expect
    .element(screen.getByText('-rw-r--r--  1 you you    48 .env'))
    .toBeVisible()
})

test('uses PowerShell to inspect the project folder on Windows', async () => {
  const screen = await render(GuideCreateAMapApiKeys, {
    apiKeyReady: true,
    operatingSystem: 'windows',
  })

  await expect.element(screen.getByText('PS> Get-ChildItem -Force')).toBeVisible()
  await expect.element(screen.getByText('-a---                .env')).toBeVisible()
})
