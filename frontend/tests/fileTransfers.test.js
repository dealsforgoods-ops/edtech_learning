import { test } from 'node:test'
import assert from 'node:assert/strict'
import { downloadFile, uploadFile } from '../src/fileTransfers.js'

test('chunked upload and download preserve a file with a partial final chunk', async () => {
  const originalFetch = globalThis.fetch
  const original = new Uint8Array(2 * 1024 * 1024 + 17).map((_, index) => index % 251)
  const file = new File([original], 'lesson.pdf', { type: 'application/pdf' })
  const chunks = []
  try {
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/file-uploads')) {
        assert.equal(JSON.parse(options.body).size, original.length)
        return Response.json({ uploadId: 'upload', chunkSize: 1024 * 1024 }, { status: 201 })
      }
      if (url.endsWith('/complete')) {
        assert.equal(chunks.length, 3)
        return Response.json({ _id: 'material', title: 'Lesson', type: 'file', content: file.name })
      }
      const uploadMatch = url.match(/\/chunks\/(\d+)$/)
      if (uploadMatch) {
        const index = Number(uploadMatch[1])
        chunks[index] = await options.body.arrayBuffer()
        return Response.json({ index })
      }
      const downloadMatch = url.match(/\/file-chunks\/(\d+)$/)
      if (downloadMatch) {
        return new Response(chunks[Number(downloadMatch[1])], { headers: { 'X-File-Size': String(original.length) } })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const material = await uploadFile('course', 'test-token', 'Lesson', file)
    const result = await downloadFile('course', material, 'test-token')
    assert.deepEqual(new Uint8Array(await result.arrayBuffer()), original)
  } finally {
    globalThis.fetch = originalFetch
  }
})
