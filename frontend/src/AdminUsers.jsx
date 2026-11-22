import { useEffect, useState } from 'react'

function AdminUsers({ token }) {
  const [users, setUsers] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function loadUsers() {
      try {
        const response = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
        if (!response.ok) throw new Error('Could not load user details.')
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('The server returned an invalid user list.')
        setUsers(data)
        setStatus('success')
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message)
          setStatus('error')
        }
      }
    }
    loadUsers()
    return () => controller.abort()
  }, [token])

  return (
    <section className="content-panel">
      <h2>Faculty and learners</h2>
      {status === 'loading' && <p>Loading user details...</p>}
      {status === 'error' && <p className="text-danger" role="alert">{error}</p>}
      {status === 'success' && users.length === 0 && <p>No faculty or learners yet.</p>}
      {status === 'success' && users.length > 0 && (
        <ul className="course-list">
          {users.map((user) => (
            <li className="course-card" key={user._id}>
              <strong>{user.name}</strong>
              <p className="mb-0">{user.email}</p>
              <p className="mb-0">Role: {user.role === 'student' ? 'Learner' : 'Faculty'}</p>
              <p className="mb-0">Status: {user.status}</p>
              {user.createdAt && <p className="mb-0">Joined: {new Date(user.createdAt).toLocaleDateString()}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default AdminUsers
