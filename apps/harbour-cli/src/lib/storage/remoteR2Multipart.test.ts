import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { retainObjectInBucket, type RemoteR2Bucket } from './remoteR2Object'
import { EVIDENCE_PART_SIZE } from './remoteR2Multipart'

const bytes = new Uint8Array(EVIDENCE_PART_SIZE + 17).fill(42)
const key = `evidence/sha256/${createHash('sha256').update(bytes).digest('hex')}`
function fixture(
  options: {
    losePart?: boolean
    loseCompletion?: boolean
    corrupt?: boolean
    failPart?: boolean
    competitor?: boolean
  } = {},
) {
  let stored: Uint8Array | undefined
  let creates = 0
  let aborts = 0
  const calls: number[] = []
  const ranges: number[] = []
  const bucket: RemoteR2Bucket = {
    async head() {
      return stored ? { size: stored.length } : null
    },
    async get(_key, options) {
      if (!stored || !options) throw new Error('Expected a bounded read')
      const { offset, length } = options.range
      ranges.push(length)
      return { arrayBuffer: async () => stored!.slice(offset, offset + length).buffer }
    },
    async put() {
      throw new Error('Unexpected whole-object PUT')
    },
    async createMultipartUpload() {
      creates++
      const parts = new Map<number, Uint8Array>()
      return {
        async uploadPart(number, data) {
          calls.push(number)
          if (options.failPart) throw new Error('HTTP 403')
          parts.set(number, data.slice())
          if (options.losePart && calls.length === 1)
            throw new Error('Network connection lost.')
          if (options.competitor) stored = new Uint8Array(bytes.length).fill(1)
          return { partNumber: number, etag: `part-${number}` }
        },
        async complete(uploaded) {
          stored = new Uint8Array(bytes.length)
          let offset = 0
          for (const { partNumber } of uploaded) {
            const part = parts.get(partNumber)!
            stored.set(part, offset)
            offset += part.length
          }
          if (options.corrupt) stored[0] = 0
          if (options.loseCompletion) throw new Error('Network connection lost.')
        },
        async abort() {
          aborts++
        },
      }
    },
  }
  return { bucket, calls, ranges, state: () => ({ stored, creates, aborts }) }
}
const retain = (bucket: RemoteR2Bucket) =>
  retainObjectInBucket(bucket, key, bytes, { contentType: 'application/json' })

test('multipart retries only the lost part, verifies bounded ranges and skips existing objects', async () => {
  const f = fixture({ losePart: true })
  await retain(f.bucket)
  await retain(f.bucket)
  expect(f.calls).toEqual([1, 1, 2])
  expect(f.state().creates).toBe(1)
  expect(f.state().stored).toEqual(bytes)
  expect(f.ranges).toEqual([EVIDENCE_PART_SIZE, 17, EVIDENCE_PART_SIZE, 17])
})

test('lost completion response verifies the committed bytes', async () => {
  const f = fixture({ loseCompletion: true })
  await retain(f.bucket)
  expect(f.state().stored).toEqual(bytes)
  expect(f.state().creates).toBe(1)
})

test('multipart aborts failed parts and refuses conflicting concurrent objects', async () => {
  for (const options of [{ failPart: true }, { competitor: true }]) {
    const f = fixture(options)
    await expect(retain(f.bucket)).rejects.toThrow(
      options.failPart ? 'HTTP 403' : 'conflict',
    )
    expect(f.state().aborts).toBe(1)
  }
})

test('multipart verifies actual completed bytes rather than declared metadata', async () => {
  await expect(retain(fixture({ corrupt: true }).bucket)).rejects.toThrow('conflict')
})

test('multipart refuses a destination unrelated to the payload digest', async () => {
  const f = fixture()
  await expect(
    retainObjectInBucket(f.bucket, `evidence/sha256/${'0'.repeat(64)}`, bytes, {
      contentType: 'application/json',
    }),
  ).rejects.toThrow('does not match SHA-256')
  expect(f.state().creates).toBe(0)
})
