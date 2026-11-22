import { useState } from 'react'

function Profile({ session, onUpdated, onTokenUpdated }) {
  const [name, setName] = useState(session.user.name)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event, endpoint, body) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
      if (!response.ok) throw new Error(result.message || 'Could not save your changes.')
      if (endpoint === '/api/me') {
        onUpdated(result)
        setName(result.name)
        setMessage('Profile updated.')
      } else {
        if (typeof result.token !== 'string' || !result.token) {
          throw new Error('Password changed, but the new session is unavailable. Please sign in again.')
        }
        onTokenUpdated(result.token)
        setCurrentPassword('')
        setNewPassword('')
        setMessage('Password updated.')
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="content-panel">
      <h2>Profile and settings</h2>
      <p>{session.user.email} · {session.user.role}</p>
      <form onSubmit={(event) => submit(event, '/api/me', { name })}>
        <label className="form-label" htmlFor="profile-name">Display name</label>
        <input id="profile-name" className="form-control mb-3" value={name}
          onChange={(event) => setName(event.target.value)} maxLength={100} required />
        <button className="btn btn-primary" disabled={busy}>Save name</button>
      </form>
      <hr />
      <form onSubmit={(event) => submit(event, '/api/me/password', { currentPassword, newPassword })}>
        <h3>Change password</h3>
        <label className="form-label" htmlFor="current-password">Current password</label>
        <input id="current-password" className="form-control mb-3" type="password"
          autoComplete="current-password" value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)} required />
        <label className="form-label" htmlFor="new-password">New password</label>
        <input id="new-password" className="form-control mb-3" type="password"
          autoComplete="new-password" value={newPassword} minLength={8}
          onChange={(event) => setNewPassword(event.target.value)} required />
        <button className="btn btn-primary" disabled={busy}>Change password</button>
      </form>
      {error && <p className="text-danger mt-3" role="alert">{error}</p>}
      {message && <p className="text-success mt-3" role="status">{message}</p>}
    </section>
  )
}

export default Profile
