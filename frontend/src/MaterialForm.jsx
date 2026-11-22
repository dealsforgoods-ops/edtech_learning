import { useState } from 'react'

function MaterialForm({ course, token, material, onSaved, onCancel }) {
  const [title, setTitle] = useState(material?.title || '')
  const [type, setType] = useState(material?.type || 'text')
  const [content, setContent] = useState(material?.content || '')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const editing = Boolean(material)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const cleanTitle = title.trim()
    const cleanContent = content.trim()
    const maxBytes = type === 'text' ? 10000 : 2048
    const isFile = type === 'file'

    if (!cleanTitle || (!isFile && !cleanContent) || (isFile && !editing && !file)) {
      setError('Title and content are required.')
      return
    }

    if (isFile && !editing && (file.size < 1 || file.size > 50 * 1024 * 1024)) {
      setError('File must be between 1 byte and 50 MB.')
      return
    }

    if (!isFile && new TextEncoder().encode(cleanContent).length > maxBytes) {
      setError(`Content must be no more than ${maxBytes} UTF-8 bytes.`)
      return
    }

    if (type === 'link') {
      let url

      try {
        url = new URL(cleanContent)
      } catch (error) {
        if (!(error instanceof TypeError)) throw error
        setError('Enter a valid HTTP or HTTPS link.')
        return
      }

      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        setError('Enter an HTTP or HTTPS link without credentials.')
        return
      }
    }

    setLoading(true)

    try {
      let endpoint = editing
        ? `/api/courses/${course._id}/materials/${material._id}`
        : `/api/courses/${course._id}/materials`
      if (isFile) {
        endpoint = editing
          ? `${endpoint}/file`
          : `${endpoint}/files?${new URLSearchParams({ title: cleanTitle, filename: file.name })}`
      }

      const response = await fetch(endpoint, {
        method: isFile && editing ? 'PATCH' : editing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': isFile && !editing ? 'application/octet-stream' : 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: isFile
          ? editing ? JSON.stringify({ title: cleanTitle }) : file
          : JSON.stringify({ title: cleanTitle, type, content: cleanContent }),
      })

      if (response.status === 401) {
        throw new Error('Your session has expired. Please sign in again.')
      }
      if (response.status === 403 || response.status === 404) {
        throw new Error('The course or material is unavailable, or you no longer have access.')
      }
      if (response.status === 409) {
        throw new Error('The course is full or changed. Refresh the page and try again.')
      }
      if (response.status === 400) {
        throw new Error('Please check the material details.')
      }
      if (response.status === 413) {
        throw new Error('File must be between 1 byte and 50 MB.')
      }
      if (!response.ok) {
        throw new Error('Could not save the material.')
      }

      const saved = await response.json()
      if (
        !saved ||
        typeof saved._id !== 'string' ||
        typeof saved.title !== 'string' ||
        typeof saved.content !== 'string' ||
        !['text', 'link', 'file'].includes(saved.type) ||
        (editing && saved._id !== material._id)
      ) {
        throw new Error('Unexpected response. Refresh the page to check the material.')
      }

      onSaved(saved)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="content-panel mt-4">
      <h2>{editing ? 'Edit material' : 'Add material'}</h2>
      <p>Course: {course.title}</p>

      <form onSubmit={handleSubmit}>
        <p>
          <label className="form-label" htmlFor="material-title">Title</label>
          <input
            id="material-title"
            className="form-control"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="material-type">Type</label>
          <select
            id="material-type"
            className="form-select"
            value={type}
            onChange={(event) => setType(event.target.value)}
            disabled={editing && (type === 'file' || material.type === 'file')}
          >
            <option value="text">Text lesson</option>
            <option value="link">External link</option>
            {!editing && <option value="file">File upload</option>}
            {editing && material.type === 'file' && <option value="file">File upload</option>}
          </select>
        </p>

        {type !== 'file' && <p>
          <label className="form-label" htmlFor="material-content">
            {type === 'link' ? 'Link URL' : 'Lesson text'}
          </label>
          <textarea
            id="material-content"
            className="form-control"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            required
          />
        </p>}
        {type === 'file' && (
          editing ? <p>File: {material.content}. Only the title can be edited.</p> : (
            <p>
              <label className="form-label" htmlFor="material-file">File (PDF, Word, PowerPoint, MP4 or WebM; up to 50 MB)</label>
              <input id="material-file" className="form-control" type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.webm"
                onChange={(event) => setFile(event.target.files[0] || null)} required />
            </p>
          )
        )}

        <button className="btn btn-primary me-2" type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save material'}
        </button>
        <button
          className="btn btn-outline-secondary"
          type="button"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </button>
        {error && <p className="text-danger mt-3" role="alert">{error}</p>}
      </form>
    </section>
  )
}

export default MaterialForm