import { useEffect, useState } from 'react'

function AdminFaculty({ token }) {
  const [faculty, setFaculty] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadFaculty() {
      try {
        const response = await fetch('/api/admin/faculty/pending', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          throw new Error('Your session is unavailable or expired. Please sign in again.')
        }
        if (!response.ok) {
          throw new Error('Could not load pending faculty.')
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

  async function approveFaculty(person) {
  if (!window.confirm(`Approve faculty access for ${person.name}?`)) {
    return
  }

  setActionError('')
  setApprovingId(person._id)

  try {
    const response = await fetch(`/api/admin/faculty/${person._id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 401) {
      throw new Error('Your session is unavailable or expired. Please sign in again.')
    }
    if (response.status === 404) {
      throw new Error('This account is no longer pending. Refresh the page.')
    }
    if (!response.ok) {
      throw new Error('Could not approve this account.')
    }

    setFaculty((current) => current.filter((item) => item._id !== person._id))
  } catch (error) {
    setActionError(error.message)
  } finally {
    setApprovingId(null)
  }
}

  return (
    <section className="content-panel mt-4">
      <h2>Pending faculty</h2>
      {actionError && <p className="text-danger" role="alert">{actionError}</p>}

      {status === 'loading' && <p>Loading faculty...</p>}
      {status === 'error' && <p className="text-danger" role="alert">{error}</p>}
      {status === 'success' && faculty.length === 0 && <p>No pending faculty.</p>}

      {status === 'success' && faculty.length > 0 && (
        <ul className="course-list">
          {faculty.map((person) => (
            <li className="course-card" key={person._id}>
              <strong>{person.name}</strong>
              <p className="mb-0">{person.email}</p>
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3"
                disabled={approvingId !== null}
                onClick={() => approveFaculty(person)}
              >
                {approvingId === person._id ? 'Approving...' : 'Approve'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default AdminFaculty