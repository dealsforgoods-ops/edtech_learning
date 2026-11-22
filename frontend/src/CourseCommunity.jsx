import { useEffect, useState } from 'react'

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'The request failed.')
  return data
}

function CourseCommunity({ course, token, user }) {
  const [reviews, setReviews] = useState(null)
  const [messages, setMessages] = useState(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [messageError, setMessageError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [reviewRefresh, setReviewRefresh] = useState(0)
  const [messageRefresh, setMessageRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const data = await requestJson(`/api/courses/${course._id}/reviews`, token, { signal: controller.signal })
        if (!Array.isArray(data)) throw new Error('The server returned invalid reviews.')
        if (!controller.signal.aborted) setReviews(data)
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message)
      }
    }
    load()
    return () => controller.abort()
  }, [course._id, token, reviewRefresh])

  useEffect(() => {
    const controller = new AbortController()
    let timer
    async function load() {
      try {
        const data = await requestJson(`/api/courses/${course._id}/messages`, token, { signal: controller.signal })
        if (!Array.isArray(data)) throw new Error('The server returned invalid messages.')
        if (!controller.signal.aborted) {
          setMessages(data)
          setMessageError('')
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessageError(error.message)
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 5000)
      }
    }
    load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [course._id, token, messageRefresh])

  async function saveReview(event, rating, comment) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await requestJson(`/api/courses/${course._id}/review`, token, {
        method: 'PUT', body: JSON.stringify({ rating, comment }),
      })
      setReviewRefresh((current) => current + 1)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage(event) {
    event.preventDefault()
    setMessageError('')
    setSending(true)
    try {
      await requestJson(`/api/courses/${course._id}/messages`, token, {
        method: 'POST', body: JSON.stringify({ text }),
      })
      setText('')
      setMessageRefresh((current) => current + 1)
    } catch (error) {
      setMessageError(error.message)
    } finally {
      setSending(false)
    }
  }

  const ownReview = reviews?.find((review) => review.studentId === user.id)

  return (
    <>
      <hr />
      <section aria-labelledby="reviews-heading">
        <h2 id="reviews-heading">Course feedback</h2>
        {error && <p className="text-danger" role="alert">{error}</p>}
        {!reviews && !error && <p>Loading feedback...</p>}
        {reviews?.length === 0 && <p>No feedback yet.</p>}
        {reviews?.length > 0 && (
          <>
            <p>Average: {(reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length).toFixed(1)} / 5</p>
            <ul className="course-list">
              {reviews.map((review) => (
                <li className="course-card" key={review._id}>
                  <strong>{review.student?.name || 'Former learner'} — {review.rating} / 5</strong>
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{review.comment}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {user.role === 'student' && reviews && (
          <ReviewForm key={ownReview?._id || 'new'} initialReview={ownReview}
            onSubmit={saveReview} busy={busy} />
        )}
      </section>
      <hr />
      <section aria-labelledby="discussion-heading">
        <h2 id="discussion-heading">Course discussion</h2>
        <p>Showing the latest 100 messages. Updates appear about every 5 seconds.</p>
        {messageError && <p className="text-danger" role="alert">{messageError}</p>}
        {!messages && !messageError && <p>Loading discussion...</p>}
        {messages?.length === 0 && <p>No messages yet.</p>}
        {messages?.length > 0 && (
          <ul className="course-list">
            {messages.map((message) => (
              <li className="course-card" key={message._id}>
                <strong>{message.author?.name || 'Former user'}</strong>
                <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                <small>{new Date(message.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={sendMessage}>
          <label className="form-label" htmlFor="discussion-message">Message</label>
          <textarea id="discussion-message" className="form-control mb-2" value={text}
            onChange={(event) => setText(event.target.value)} maxLength={2000} required />
          <button className="btn btn-primary" disabled={sending}>Send message</button>
        </form>
      </section>
    </>
  )
}

function ReviewForm({ initialReview, onSubmit, busy }) {
  const [rating, setRating] = useState(String(initialReview?.rating || 5))
  const [comment, setComment] = useState(initialReview?.comment || '')
  return (
    <form onSubmit={(event) => onSubmit(event, Number(rating), comment)}>
      <h3>{initialReview ? 'Edit your feedback' : 'Your feedback'}</h3>
      <label className="form-label" htmlFor="review-rating">Rating</label>
      <select id="review-rating" className="form-select mb-2" value={rating}
        onChange={(event) => setRating(event.target.value)}>
        {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}
      </select>
      <label className="form-label" htmlFor="review-comment">Comment</label>
      <textarea id="review-comment" className="form-control mb-2" value={comment}
        onChange={(event) => setComment(event.target.value)} maxLength={2000} required />
      <button className="btn btn-primary" disabled={busy}>Save feedback</button>
    </form>
  )
}

export default CourseCommunity
