import { useState } from 'react'

function LoginForm({ session, onLogin, onSignOut }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (response.status === 401) {
        throw new Error('Invalid email or password.')
      }
      if (response.status === 403) {
        throw new Error('Your account is not active.')
      }
      if (!response.ok) {
        throw new Error('Unable to sign in. Please try again.')
      }

      const data = await response.json()
      if (!data.token || !data.user?.name) {
        throw new Error('The server returned an invalid login response.')
      }

      onLogin(data)
      setPassword('')
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (session) {
    return (
      <section>
        <p>Signed in as {session.user.name}</p>
        <button className="btn btn-outline-primary" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    )
  }

  return (
    <section>
      <h2>Sign in</h2>

      <form onSubmit={handleSubmit}>
        <p>
          <label className="form-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="form-control"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="form-control"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </p>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        {error && <p className="text-danger mt-3 mb-0" role="alert">{error}</p>}
      </form>
    </section>
  )
}

export default LoginForm