import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'

import GuideCreateAMapApiKeys from './guideCreateAMapApiKeys.svelte'

test('hides .env instructions once an API key is ready', async () => {
  const screen = await render(GuideCreateAMapApiKeys, {
    apiKeyReady: true,
    editorLabel: 'VS Code',
    newFileShortcut: 'Ctrl+N',
  })

  await expect
    .element(screen.getByRole('heading', { name: 'Add your API key to the project' }))
    .not.toBeVisible()
})

test('asks the user to confirm their existing key is in .env', async () => {
  const screen = await render(GuideCreateAMapApiKeys, {
    editorLabel: 'Zed',
    newFileShortcut: 'Ctrl+N',
  })

  await screen.getByRole('button', { name: 'Use Existing' }).click()

  await expect
    .element(screen.getByRole('heading', { name: 'Add your API key to the project' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'API key ready' }))
    .not.toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'I have added my API key to .env' }))
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
