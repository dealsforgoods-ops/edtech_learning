import { useEffect, useState } from 'react'
import MaterialForm from './MaterialForm'
import CourseCommunity from './CourseCommunity'
import FileMaterial from './FileMaterial'

function safeLink(content) {
  try {
    const url = new URL(content)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
      return url.href
    }
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
  }
  return null
}

function CourseMaterials({ course, token, canManage, user }) {
  const [materials, setMaterials] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [formMode, setFormMode] = useState(null)
  const [editingMaterial, setEditingMaterial] = useState(null)
  const [completed, setCompleted] = useState(null)
  const [progressError, setProgressError] = useState('')
  const [savingProgress, setSavingProgress] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  async function deleteMaterial(item) {
    if (!window.confirm(`Permanently delete "${item.title}" and its learner progress?`)) return
    setDeletingId(item._id)
    setDeleteError('')
    try {
      const response = await fetch(`/api/courses/${course._id}/materials/${item._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.message || 'Could not delete material.')
      }
      setMaterials((current) => current.filter((entry) => entry._id !== item._id))
    } catch (error) {
      setDeleteError(error.message)
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    if (user.role !== 'student') return
    const controller = new AbortController()
    async function loadProgress() {
      try {
        const response = await fetch(`/api/courses/${course._id}/progress`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
        if (!response.ok) throw new Error('Could not load lesson progress.')
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('The server returned invalid lesson progress.')
        if (!controller.signal.aborted) setCompleted(data.map((item) => item.materialId))
      } catch (error) {
        if (!controller.signal.aborted) setProgressError(error.message)
      }
    }
    loadProgress()
    return () => controller.abort()
  }, [course._id, token, user.role])

  async function updateProgress(materialId, isComplete) {
    setSavingProgress(true)
    setProgressError('')
    try {
      const response = await fetch(`/api/courses/${course._id}/progress/${materialId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ completed: isComplete }),
      })
      if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
      if (!response.ok) throw new Error('Could not save lesson progress.')
      setCompleted((current) => isComplete
        ? [...current.filter((id) => id !== materialId), materialId]
        : current.filter((id) => id !== materialId))
    } catch (error) {
      setProgressError(error.message)
    } finally {
      setSavingProgress(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadMaterials() {
      try {
        const response = await fetch(`/api/courses/${course._id}/materials`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }
        if (response.status === 403) {
          throw new Error('You do not have access to these materials.')
        }
        if (response.status === 404) {
          throw new Error('Course not found.')
        }
        if (!response.ok) {
          throw new Error('Could not load course materials.')
        }

        const data = await response.json()
        if (!Array.isArray(data) || !data.every((item) =>
          item &&
          typeof item._id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.content === 'string' &&
          ['text', 'link', 'file'].includes(item.type)
        )) {
          throw new Error('The server returned invalid materials.')
        }

        if (!controller.signal.aborted) {
          setMaterials(data)
          setStatus('success')
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message)
          setStatus('error')
        }
      }
    }

    loadMaterials()
    return () => controller.abort()
  }, [course._id, token])

  if (formMode && canManage) {
    return (
      <MaterialForm
        key={editingMaterial?._id || 'new'}
        course={course}
        token={token}
        material={editingMaterial}
        onCancel={() => {
          setFormMode(null)
          setEditingMaterial(null)
        }}
        onSaved={(saved) => {
          setMaterials((current) =>
            formMode === 'edit'
              ? current.map((item) => item._id === saved._id ? saved : item)
              : [...current, saved]
          )
          setFormMode(null)
          setEditingMaterial(null)
        }}
      />
    )
  }

  return (
    <section className="content-panel mt-4">
      <h2>Course materials</h2>
      <p>Course: {course.title}</p>

      {status === 'loading' && <p>Loading materials...</p>}
      {status === 'error' && <p className="text-danger" role="alert">{error}</p>}
      {deleteError && <p className="text-danger" role="alert">{deleteError}</p>}
      {status === 'success' && materials.length === 0 && <p>No materials yet.</p>}
      {user.role === 'student' && progressError && <p className="text-danger" role="alert">{progressError}</p>}
      {user.role === 'student' && completed && status === 'success' && (
        <p>Completed: {materials.filter((item) => completed.includes(item._id)).length} / {materials.length}</p>
      )}

      {canManage && status === 'success' && (
        materials.length < 5 ? (
          <button
            type="button"
            className="btn btn-primary mb-3"
            onClick={() => {
              setEditingMaterial(null)
              setFormMode('add')
            }}
          >
            Add material
          </button>
        ) : (
          <p>Maximum of five materials reached.</p>
        )
      )}

      {status === 'success' && materials.length > 0 && (
        <ul className="course-list">
          {materials.map((item) => {
            const link = item.type === 'link' ? safeLink(item.content) : null

            return (
              <li className="course-card" key={item._id}>
                <h3>{item.title}</h3>
                {item.type === 'text' && (
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                    {item.content}
                  </p>
                )}
                {item.type === 'link' && (
                  link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      Open external link
                    </a>
                  ) : (
                    <p className="text-danger" role="alert">This link is invalid.</p>
                  )
                )}
                {item.type === 'file' && (
                  <FileMaterial courseId={course._id} material={item} token={token} />
                )}
                {canManage && (
                  <>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm mt-3"
                    onClick={() => {
                      setEditingMaterial(item)
                      setFormMode('edit')
                    }}
                  >
                    Edit material
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm mt-3 ms-2"
                    disabled={deletingId !== null}
                    onClick={() => deleteMaterial(item)}
                  >
                    {deletingId === item._id ? 'Deleting...' : 'Delete material'}
                  </button>
                  </>
                )}
                {user.role === 'student' && completed && (
                  <button
                    type="button"
                    className="btn btn-outline-success btn-sm mt-3"
                    disabled={savingProgress}
                    onClick={() => updateProgress(item._id, !completed.includes(item._id))}
                  >
                    {completed.includes(item._id) ? 'Mark not completed' : 'Mark completed'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <CourseCommunity course={course} token={token} user={user} />
    </section>
  )
}

export default CourseMaterials