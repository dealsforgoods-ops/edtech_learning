import { useEffect, useState } from 'react'

function AssignFaculty({ course, token, onSaved }) {
  const [faculty, setFaculty] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [selectedFaculty, setSelectedFaculty] = useState(course.facultyId || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadFaculty() {
      try {
        const response = await fetch('/api/admin/faculty/active', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }
        if (response.status === 403) {
          throw new Error('Admin access is required.')
        }
        if (!response.ok) {
          throw new Error('Could not load active faculty.')
        }

        const data = await response.json()
        if (!Array.isArray(data)) {
          throw new Error('The server returned an invalid faculty list.')
        }

        setFaculty(data)
        setStatus('success')
      } catch (error) {
        if (error.name !== 'AbortError') {
          setError(error.message)
          setStatus('error')
        }
      }
    }

    loadFaculty()
    return () => controller.abort()
  }, [token])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaveError('')
    setMessage('')
    setSaving(true)

    try {
      const response = await fetch(`/api/admin/courses/${course._id}/faculty`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ facultyId: selectedFaculty }),
      })

      if (response.status === 401) {
        throw new Error('Your session has expired. Please sign in again.')
      }
      if (response.status === 403) {
        throw new Error('Admin access is required.')
      }
      if (response.status === 404) {
        throw new Error('The course or faculty member is no longer available.')
      }
      if (!response.ok) {
        throw new Error('Could not save the assignment.')
      }

      const updated = await response.json()
      onSaved(updated)
      setMessage('Faculty assignment saved.')
    } catch (error) {
      setSaveError(error.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="content-panel mt-4">
      <h2>Assign faculty</h2>
      <p>Course: {course.title}</p>

      {status === 'loading' && <p>Loading faculty...</p>}
      {status === 'error' && <p className="text-danger" role="alert">{error}</p>}
      {status === 'success' && faculty.length === 0 && <p>No active faculty available.</p>}
      {status === 'success' && faculty.length > 0 && (
        <form onSubmit={handleSubmit}>
          <label className="form-label" htmlFor="assigned-faculty">
            Faculty member
          </label>
          <select
            id="assigned-faculty"
            className="form-select"
            value={selectedFaculty}
            onChange={(event) => {
              setSelectedFaculty(event.target.value)
              setMessage('')
              setSaveError('')
            }}
            disabled={saving}
            required
          >
            <option value="">Select a faculty member</option>
            {selectedFaculty && !faculty.some((person) => person._id === selectedFaculty) && (
              <option value={selectedFaculty} disabled>
                Current faculty is no longer active
              </option>
            )}
            {faculty.map((person) => (
              <option key={person._id} value={person._id}>
                {person.name} ({person.email})
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="btn btn-primary mt-3"
            disabled={saving || !faculty.some((person) => person._id === selectedFaculty)}
          >
            {saving ? 'Saving...' : 'Save assignment'}
          </button>
          {saveError && <p className="text-danger mt-3" role="alert">{saveError}</p>}
          {message && <p className="text-success mt-3" role="status">{message}</p>}
        </form>
      )}
    </section>
  )
}

export default AssignFaculty