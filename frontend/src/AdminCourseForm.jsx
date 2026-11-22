import { useState } from 'react'

function AdminCourseForm({ token, onCreated }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch('/api/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, category, description }),
      })

      if (response.status === 401) {
        throw new Error('Your session has expired. Please sign in again.')
      }
      if (response.status === 403) {
        throw new Error('Admin access is required.')
      }
      if (response.status === 400) {
        throw new Error('Please check the course details.')
      }
      if (!response.ok) {
        throw new Error('Could not create the course.')
      }

      const course = await response.json()
      onCreated(course)
      setTitle('')
      setCategory('')
      setDescription('')
      setMessage('Course created successfully.')
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="content-panel mt-4">
      <h2>Add a course</h2>

      <form onSubmit={handleSubmit}>
        <p>
          <label className="form-label" htmlFor="course-title">Title</label>
          <input
            id="course-title"
            className="form-control"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="course-category">Category</label>
          <input
            id="course-category"
            className="form-control"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={100}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="course-description">Description</label>
          <textarea
            id="course-description"
            className="form-control"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            required
          />
        </p>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create course'}
        </button>
        {error && <p className="text-danger mt-3" role="alert">{error}</p>}
        {message && <p className="text-success mt-3" role="status">{message}</p>}
      </form>
    </section>
  )
}

export default AdminCourseForm