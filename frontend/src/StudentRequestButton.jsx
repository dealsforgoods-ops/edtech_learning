import { useState } from 'react'

function StudentRequestButton({ course, token, requestStatus, onRequested }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function requestAccess() {
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`/api/courses/${course._id}/requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.status === 401) {
        throw new Error('Your session has expired. Please sign in again.')
      }
      if (response.status === 409) {
        throw new Error('Already requested. Refresh the page to see the current status.')
      }
      if (response.status === 404) {
        throw new Error('Course not found. Please refresh the page.')
      }
      if (!response.ok) {
        throw new Error('Could not request access. Refresh the page and try again.')
      }

      const result = await response.json()
      if (result.courseId !== course._id || result.status !== 'pending') {
        throw new Error('Unexpected response. Refresh the page to check your request.')
      }

      onRequested(result)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (requestStatus === 'pending') {
    return <p className="mt-3 mb-0" role="status">Request pending</p>
  }

  if (requestStatus === 'approved') {
    return <p className="mt-3 mb-0" role="status">Enrolled</p>
  }

  if (requestStatus) {
    return <p className="text-danger mt-3" role="alert">Unknown request status.</p>
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={loading}
        onClick={requestAccess}
      >
        {loading ? 'Requesting...' : 'Request access'}
      </button>
      {error && <p className="text-danger mt-2" role="alert">{error}</p>}
    </div>
  )
}

export default StudentRequestButton