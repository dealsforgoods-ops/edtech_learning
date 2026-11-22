import { useState } from 'react'

function RegisterForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      })

      if (response.status === 409) {
        throw new Error('That email is already registered.')
      }
      if (response.status === 400) {
        throw new Error('Please check your registration details.')
      }
      if (!response.ok) {
        throw new Error('Unable to register. Please try again.')
      }

      const user = await response.json()

      if (user.status === 'pending') {
        setMessage('Registration complete. Your faculty account needs admin approval.')
      } else if (user.status === 'active') {
        setMessage('Registration complete. You can now sign in.')
      } else {
        throw new Error('The server returned an unexpected account status.')
      }

      setName('')
      setEmail('')
      setPassword('')
      setRole('student')
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Create an account</h2>

      <form onSubmit={handleSubmit}>
        <p>
          <label className="form-label" htmlFor="register-name">Name</label>
          <input
            id="register-name"
            className="form-control"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="register-email">Email</label>
          <input
            id="register-email"
            className="form-control"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="register-password">Password</label>
          <input
            id="register-password"
            className="form-control"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </p>

        <p>
          <label className="form-label" htmlFor="register-role">Role</label>
          <select
            id="register-role"
            className="form-select"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="student">Student</option>
            <option value="faculty">Faculty</option>
          </select>
        </p>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Registering...' : 'Register'}
        </button>
        {error && <p className="text-danger mt-3 mb-0" role="alert">{error}</p>}
        {message && <p className="text-success mt-3 mb-0" role="status">{message}</p>}
      </form>
    </section>
  )
}

export default RegisterForm