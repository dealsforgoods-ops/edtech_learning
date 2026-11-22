import { useState } from 'react'

function EditCourseForm({ course, token, onSaved, onCancel }) {
  const [title, setTitle] = useState(course.title)
  const [category, setCategory] = useState(course.category)
  const [description, setDescription] = useState(course.description)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`/api/courses/${course._id}`, {
        method: 'PUT',
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
        throw new Error('You do not have permission to edit courses.')
      }
      if (response.status === 404) {
        throw new Error('Course not found or no longer assigned to you. Please refresh the page.')
      }
      if (response.status === 400) {
        throw new Error('Please check the course details.')
      }
      if (!response.ok) {
        throw new Error('Could not update the course.')
      }

      const updated = await response.json()
      onSaved(updated)
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="content-panel mt-4">
      <h2>Edit course</h2>

      <form onSubmit={handleSubmit}>
        <p>
          <label className="form-label" htmlFor="edit-title">Title</label>
          <input
            id="edit-title"
            className="form-control"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="edit-category">Category</label>
          <input
            id="edit-category"
            className="form-control"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={100}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="edit-description">Description</label>
          <textarea
            id="edit-description"
            className="form-control"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            required
          />
        </p>

        <button className="btn btn-primary me-2" type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save changes'}
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

export default EditCourseForm