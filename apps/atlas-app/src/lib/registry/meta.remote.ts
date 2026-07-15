import {
  getRegistryApi,
  getRegistrySource,
  getRegistrySourcePublisher,
  listRegistryApis,
  listRegistryReleases,
  listRegistrySources,
} from '@repo/core/db/metaRegistry'
import { createMetaDb } from '@repo/db'
import { error, redirect } from '@sveltejs/kit'
import { getRequestEvent, query } from '$app/server'
import { z } from 'zod'

import type {
  ApiRelease,
  RegistryApi,
  RegistryPublisher,
  RegistrySource,
} from './types'

const registryCodeSchema = z.string().trim().min(1).max(200)
const apiReleaseSchema = z.object({
  familyType: registryCodeSchema,
  releaseCode: registryCodeSchema,
})

function getMetaDb() {
  const event = getRequestEvent()
  const binding = event.platform?.env.DB_META
  if (!binding) throw new Error('D1 binding "DB_META" not found.')
  return createMetaDb(binding)
}

export const getSourcesPageData = query(
  async () => (await listRegistrySources(getMetaDb(), 200)) as RegistrySource[],
)

export const getSourcePageData = query(registryCodeSchema, async datasetCode => {
  const source = (await getRegistrySource(
    getMetaDb(),
    datasetCode,
  )) as RegistrySource | null
  if (!source) error(404, 'Source dataset not found.')

  const latestVersion = source.sourceVersions?.[0]
  if (latestVersion) {
    redirect(302, `/sources/${source.code}/${latestVersion.code}`)
  }

  return source
})

export const getSourceDatasetPageData = query(registryCodeSchema, async datasetCode => {
  const source = (await getRegistrySource(
    getMetaDb(),
    datasetCode,
  )) as RegistrySource | null
  if (!source) error(404, 'Source dataset not found.')
  return source
})

export const getPublisherPageData = query(registryCodeSchema, async publisherCode => {
  const db = getMetaDb()
  const [registryPublisher, registrySources] = await Promise.all([
    getRegistrySourcePublisher(db, publisherCode),
    listRegistrySources(db),
  ])
  const publisher = registryPublisher as RegistryPublisher | null
  const sources = registrySources as RegistrySource[]

  if (!publisher) error(404, 'Publisher not found.')

  return {
    publisher,
    sources: sources.filter(source => source.publisherId === publisher.id),
  }
})

export const getDataPageData = query(async () => {
  const db = getMetaDb()
  const [releases, apis] = await Promise.all([
    listRegistryReleases(db, 12),
    listRegistryApis(db, 100),
  ])

  return {
    releases: releases as ApiRelease[],
    apis: apis as RegistryApi[],
  }
})

export const getApiFamilyPageData = query(registryCodeSchema, async familyType => {
  const api = (await getRegistryApi(getMetaDb(), familyType)) as RegistryApi | null
  if (!api) error(404, 'API family not found.')

  const latestRelease = api.releases?.[0]
  if (latestRelease) {
    redirect(302, `/apis/${api.familyType}/${latestRelease.code}`)
  }

  return { api, release: null }
})

export const getApiReleasePageData = query(
  apiReleaseSchema,
  async ({ familyType, releaseCode }) => {
    const api = (await getRegistryApi(getMetaDb(), familyType)) as RegistryApi | null
    if (!api) error(404, 'API family not found.')

    const release = api.releases?.find(item => item.code === releaseCode)
    if (!release) error(404, 'API release not found.')

    return { api, release }
  },
)
