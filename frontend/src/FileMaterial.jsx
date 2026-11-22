import { useEffect, useRef, useState } from 'react'

function FileMaterial({ courseId, material, token }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const activeRequest = useRef(null)
  const isVideo = /\.(mp4|webm)$/i.test(material.content)

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])

  useEffect(() => () => {
    activeRequest.current?.abort()
  }, [])

  async function loadFile() {
    const controller = new AbortController()
    activeRequest.current = controller
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/courses/${courseId}/materials/${material._id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
      if (!response.ok) throw new Error('Could not load the file or you no longer have access.')
      const blob = await response.blob()
      if (!controller.signal.aborted) setUrl(URL.createObjectURL(blob))
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return (
    <div>
      <p className="mb-1">File: {material.content}</p>
      {!url && (
        <button type="button" className="btn btn-outline-primary btn-sm"
          disabled={loading} onClick={loadFile}>
          {loading ? 'Loading file...' : 'Load file'}
        </button>
      )}
      {url && (
        <>
          {isVideo && <video controls src={url} style={{ maxWidth: '100%' }}>Video playback is not supported.</video>}
          <p><a href={url} download={material.content}>Download file</a></p>
        </>
      )}
      {error && <p className="text-danger" role="alert">{error}</p>}
    </div>
  )
}

export default FileMaterial
