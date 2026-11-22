import { useEffect, useState } from 'react'

function AdminCourseRequests({ token, onApproved }) {
  const [requests, setRequests] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadRequests() {
      try {
        const response = await fetch('/api/admin/course-requests/pending', {
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
          throw new Error('Could not load course requests.')
        }

        const data = await response.json()
        if (!Array.isArray(data)) {
          throw new Error('The server returned an invalid request list.')
        }

        if (!controller.signal.aborted) {
          setRequests(data)
          setStatus('success')
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message)
          setStatus('error')
        }
      }
    }

    loadRequests()
    return () => controller.abort()
  }, [token])

  async function approveRequest(item) {
    if (!window.confirm(`Approve ${item.student.name} for ${item.course.title}?`)) {
      return
    }

    setActionError('')
    setMessage('')
    setApprovingId(item._id)

    try {
      const response = await fetch(`/api/admin/course-requests/${item._id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.status === 401) {
        throw new Error('Your session has expired. Please sign in again.')
      }
      if (response.status === 403) {
        throw new Error('Admin access is required.')
      }
      if (response.status === 404) {
        throw new Error('This request is no longer pending. Refresh the page.')
      }
      if (response.status === 409) {
        throw new Error('The student or course is unavailable, or the request changed.')
      }
      if (!response.ok) {
        throw new Error('Could not approve the request.')
      }

      const approved = await response.json()
      if (approved._id !== item._id || approved.status !== 'approved') {
        throw new Error('Unexpected response. Refresh the page to check the request.')
      }

      setRequests((current) => current.filter((request) => request._id !== item._id))
      setMessage('Course request approved.')
      if (onApproved) {
        onApproved()
      }
    } catch (error) {
      setActionError(error.message)
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <section className="content-panel mt-4">
      <h2>Course requests</h2>
      {actionError && <p className="text-danger" role="alert">{actionError}</p>}
      {message && <p className="text-success" role="status">{message}</p>}
      {status === 'loading' && <p>Loading requests...</p>}
      {status === 'error' && <p className="text-danger" role="alert">{error}</p>}
      {status === 'success' && requests.length === 0 && <p>No pending course requests.</p>}

      {status === 'success' && requests.length > 0 && (
        <ul className="course-list">
          {requests.map((item) => (
            <li className="course-card" key={item._id}>
              <h3>{item.course?.title || 'Course unavailable'}</h3>
              <p className="mb-0">Student: {item.student?.name || 'Student unavailable'}</p>
              {item.student?.email && <p className="mb-0">{item.student.email}</p>}
              {item.student?._id && item.course?._id ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm mt-3"
                  disabled={approvingId !== null}
                  onClick={() => approveRequest(item)}
                >
                  {approvingId === item._id ? 'Approving...' : 'Approve'}
                </button>
              ) : (
                <p className="text-danger mt-3">Cannot approve: student or course is unavailable.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default AdminCourseRequests