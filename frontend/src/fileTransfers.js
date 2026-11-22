const CHUNK_SIZE = 1024 * 1024
const MAX_FILE_BYTES = 50 * CHUNK_SIZE

async function checkResponse(response) {
  if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.message || 'File transfer failed.')
  }
}

export async function uploadFile(courseId, token, title, file) {
  const base = `/api/courses/${courseId}/file-uploads`
  const headers = { Authorization: `Bearer ${token}` }
  const start = await fetch(base, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, filename: file.name, size: file.size }),
  })
  await checkResponse(start)
  const session = await start.json()
  if (typeof session.uploadId !== 'string' || session.chunkSize !== CHUNK_SIZE) {
    throw new Error('The server returned an invalid upload session.')
  }
  for (let offset = 0, index = 0; offset < file.size; offset += CHUNK_SIZE, index++) {
    const response = await fetch(`${base}/${session.uploadId}/chunks/${index}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      body: file.slice(offset, offset + CHUNK_SIZE),
    })
    await checkResponse(response)
  }
  const complete = await fetch(`${base}/${session.uploadId}/complete`, { method: 'POST', headers })
  await checkResponse(complete)
  return complete.json()
}

export async function downloadFile(courseId, material, token, signal) {
  const parts = []
  let totalSize
  for (let index = 0; totalSize === undefined || index * CHUNK_SIZE < totalSize; index++) {
    const response = await fetch(
      `/api/courses/${courseId}/materials/${material._id}/file-chunks/${index}`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    )
    await checkResponse(response)
    const size = Number(response.headers.get('X-File-Size'))
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES ||
      (totalSize !== undefined && size !== totalSize)) {
      throw new Error('The server returned an invalid file size.')
    }
    totalSize = size
    const part = await response.arrayBuffer()
    if (part.byteLength !== Math.min(CHUNK_SIZE, totalSize - index * CHUNK_SIZE)) {
      throw new Error('The server returned an incomplete file.')
    }
    parts.push(part)
  }
  const type = /\.mp4$/i.test(material.content) ? 'video/mp4'
    : /\.webm$/i.test(material.content) ? 'video/webm' : 'application/octet-stream'
  return new Blob(parts, { type })
}
