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
    .not.toBeInTheDocument()
})

test('restores key creation instructions after resetting a confirmed key', async () => {
  const screen = await render(GuideCreateAMapApiKeys, {
    apiKeyReady: true,
  })

  await expect
    .element(screen.getByRole('button', { name: 'Reset' }))
    .not.toBeInTheDocument()
  await screen.getByRole('button', { name: 'API key ready' }).click()

  await expect
    .element(screen.getByText(/We assume your API key is stored as/))
    .toBeVisible()
  await expect
    .element(screen.getByPlaceholder('e.g. SaanSeoi Project'))
    .not.toBeInTheDocument()
  await screen.getByRole('button', { name: 'Reset' }).click()

  await expect.element(screen.getByPlaceholder('e.g. SaanSeoi Project')).toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Use Existing' }))
    .toBeVisible()
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
    .not.toBeInTheDocument()
  await expect
    .element(screen.getByRole('button', { name: 'I have added my API key to .env' }))
    .toBeVisible()
})

test('uses PowerShell to inspect the project folder on Windows', async () => {
  const screen = await render(GuideCreateAMapApiKeys, {
    operatingSystem: 'windows',
  })

  await screen.getByRole('button', { name: 'Use Existing' }).click()

  await expect.element(screen.getByText('PS> Get-ChildItem -Force')).toBeVisible()
  await expect.element(screen.getByText('-a---                .env')).toBeVisible()
})
