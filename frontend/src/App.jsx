import { useEffect, useState } from 'react'
import LoginForm from './LoginForm'
import RegisterForm from './RegisterForm'
import AdminFaculty from './AdminFaculty'
import AdminCourseForm from './AdminCourseForm'
import EditCourseForm from './EditCourseForm'
import AssignFaculty from './AssignFaculty'
import StudentRequestButton from './StudentRequestButton'
import AdminCourseRequests from './AdminCourseRequests'
import CourseMaterials from './CourseMaterials'
import AdminUsers from './AdminUsers'
import Profile from './Profile'

function App() {
  const [courses, setCourses] = useState([])
  const [status, setStatus] = useState('loading')
  const [authView, setAuthView] = useState('login')
  const [session, setSession] = useState(null)
  const [editingCourse, setEditingCourse] = useState(null)
  const [assigningCourse, setAssigningCourse] = useState(null)
  const [pageView, setPageView] = useState('home')
  const isAdmin = session?.user?.role === 'admin'
  const isFaculty = session?.user?.role === 'faculty'
  const [studentRequests, setStudentRequests] = useState({
    token: null,
    status: 'idle',
    items: [],
    error: '',
  })

  const [pendingRequestRefresh, setPendingRequestRefresh] = useState(0)
  const [pendingRequests, setPendingRequests] = useState({
    token: null,
    status: 'idle',
    count: 0,
    error: '',
  })

  const hasPendingRequests = isAdmin &&
  pendingRequests.token === session.token &&
  pendingRequests.status === 'success' &&
  pendingRequests.count > 0
  
  const isStudent = session?.user?.role === 'student'
  const [materialsCourse, setMaterialsCourse] = useState(null)

  function navigate(view) {
  setEditingCourse(null)
  setAssigningCourse(null)
  setPageView(view)
  setMaterialsCourse(null)
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadCourses() {
      try {
        const response = await fetch('/api/courses', {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`)
        }

        const data = await response.json()
        if (!Array.isArray(data)) {
          throw new Error('Expected a list of courses')
        }

        setCourses(data)
        setStatus('success')
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to load courses:', error)
          setStatus('error')
        }
      }
    }

    loadCourses()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const token = session?.token
    if (!isStudent || !token) return

    const controller = new AbortController()

    async function loadStudentRequests() {
      try {
        const response = await fetch('/api/me/course-requests', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }
        if (!response.ok) {
          throw new Error('Could not load your course requests.')
        }

        const items = await response.json()
        if (!Array.isArray(items)) {
          throw new Error('The server returned an invalid request list.')
        }

        if (!controller.signal.aborted) {
          setStudentRequests({ token, status: 'success', items, error: '' })
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStudentRequests({ token, status: 'error', items: [], error: error.message })
        }
      }
    }

    loadStudentRequests()
    return () => controller.abort()
  }, [isStudent, session?.token])
  
  useEffect(() => {
    const token = session?.token
    if (!isAdmin || !token) return

    const controller = new AbortController()
    let timer

    async function checkPendingRequests() {
      try {
        const response = await fetch('/api/admin/course-requests/pending', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (response.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }
        if (!response.ok) {
          throw new Error('Could not check pending course requests.')
        }

        const requests = await response.json()
        if (!Array.isArray(requests)) {
          throw new Error('The server returned an invalid request list.')
        }

        if (!controller.signal.aborted) {
          setPendingRequests({ token, status: 'success', count: requests.length, error: '' })
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPendingRequests({ token, status: 'error', count: 0, error: error.message })
        }
      } finally {
        if (!controller.signal.aborted) {
          timer = setTimeout(checkPendingRequests, 30000)
        }
      }
    }

    checkPendingRequests()

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [isAdmin, session?.token, pendingRequestRefresh])

  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <div className="site-brand">
            <span className="brand-mark" aria-hidden="true">E</span>
            <span>EdTech <span className="brand-accent">ELearn</span></span>
          </div>
          <nav className="site-nav" aria-label="Main navigation">
            <button
              type="button"
              className={pageView === 'courses' ? 'btn btn-primary' : 'btn btn-outline-primary'}
              aria-pressed={pageView === 'courses'}
              onClick={() => navigate('courses')}
            >
              Courses
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  className={pageView === 'users' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                  aria-pressed={pageView === 'users'}
                  onClick={() => navigate('users')}
                >
                  Faculty and learners
                </button>
                <button
                  type="button"
                  className={pageView === 'add' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                  aria-pressed={pageView === 'add'}
                  onClick={() => navigate('add')}
                >
                  Add course
                </button>
                <button
                  type="button"
                  className={pageView === 'faculty' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                  aria-pressed={pageView === 'faculty'}
                  onClick={() => navigate('faculty')}
                >
                  Pending faculty
                </button>
                <button
                  type="button"
                  className={
                    hasPendingRequests
                      ? 'btn btn-warning'
                      : pageView === 'course-requests'
                        ? 'btn btn-primary'
                        : 'btn btn-outline-primary'
                  }
                  aria-pressed={pageView === 'course-requests'}
                  onClick={() => {
                    setPendingRequestRefresh((current) => current + 1)
                    navigate('course-requests')
                  }}
                >
                  Course requests
                  {hasPendingRequests && ` (${pendingRequests.count} pending)`}
                </button>
                {pendingRequests.token === session.token && pendingRequests.status === 'error' && (
                  <span className="text-danger" role="alert">{pendingRequests.error}</span>
                )}
              </>
            )}
            {session && (
              <button
                type="button"
                className={pageView === 'profile' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                aria-pressed={pageView === 'profile'}
                onClick={() => navigate('profile')}
              >
                Profile
              </button>
            )}
            {!session && (
              <>
                <button
                  type="button"
                  className={authView === 'login' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                  onClick={() => {
                    setAuthView('login')
                    navigate('home')
                  }}
                  aria-pressed={authView === 'login'}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={authView === 'register' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                  onClick={() => {
                    setAuthView('register')
                    navigate('home')
                  }}
                  aria-pressed={authView === 'register'}
                >
                  Register
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container page-content">
        <div className="welcome">
          <p className="eyebrow">LEARN AT YOUR OWN PACE</p>
          <h1>Welcome to EdTech ELearn</h1>
          <p>Explore courses and take the next step in your learning journey.</p>
        </div>

        <div className="row g-4 align-items-start">
          <div className="col-12 col-lg-5">
            <div className="content-panel">
              {authView === 'login' ? (
                <LoginForm
                  session={session}
                  onLogin={(nextSession) => {
                    setSession(nextSession)
                    setStudentRequests({ token: null, status: 'idle', items: [], error: '' })
                    navigate('home')
                  }}
                  onSignOut={() => {
                    setSession(null)
                    setStudentRequests({ token: null, status: 'idle', items: [], error: '' })
                    navigate('home')
                  }}
                />
              ) : (
                <RegisterForm />
              )}
            </div>
          </div>
          {pageView === 'courses' && (
          <section className="col-12 col-lg-7" id="courses" aria-labelledby="courses-heading">
            <div className="content-panel">
              <h2 id="courses-heading">Courses</h2>
              <p className="section-description">Browse available learning opportunities.</p>
              {isStudent && studentRequests.token !== session.token && (
                <p>Loading your course requests...</p>
              )}
              {isStudent && studentRequests.token === session.token && studentRequests.status === 'error' && (
                <p className="text-danger" role="alert">
                  {studentRequests.error} Refresh the page to try again.
                </p>
              )}
              {status === 'loading' && <p>Loading courses...</p>}
              {status === 'error' && <p role="alert">Could not load courses. Please try again later.</p>}
              {status === 'success' && courses.length === 0 && <p>No courses available yet.</p>}

              {status === 'success' && courses.length > 0 && (
                <ul className="course-list">
                  {courses.map((course) => (
                    <li className="course-card" key={course._id}>
                      <p className="course-category">{course.category}</p>
                      <h3>{course.title}</h3>
                      <p className="mb-0">{course.description}</p>
                      {(
                        isAdmin ||
                        (isFaculty && course.facultyId === session.user.id) ||
                        (
                          isStudent &&
                          studentRequests.token === session.token &&
                          studentRequests.status === 'success' &&
                          studentRequests.items.some(
                            (item) => item.courseId === course._id && item.status === 'approved'
                          )
                        )
                      ) && (
                        <button
                          type="button"
                          className="btn btn-outline-success btn-sm mt-3 me-2"
                          onClick={() => {
                            setMaterialsCourse(course)
                            setPageView('materials')
                          }}
                        >
                          View materials
                        </button>
                      )}
                      {isStudent && studentRequests.token === session.token &&
                        studentRequests.status === 'success' && (
                        <StudentRequestButton
                          course={course}
                          token={session.token}
                          requestStatus={studentRequests.items.find(
                            (item) => item.courseId === course._id
                          )?.status}
                          onRequested={(result) => {
                            setStudentRequests((current) =>
                              current.token === session.token
                                ? { ...current, items: [...current.items, result] }
                                : current
                            )
                          }}
                        />
                      )}
                      {(isAdmin || (isFaculty && course.facultyId === session.user.id)) && (
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm mt-3"
                          onClick={() => {
                            setEditingCourse(course)
                            setPageView('edit')
                          }}
                        >
                          Edit
                        </button>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm mt-3 ms-2"
                          onClick={() => {
                            setAssigningCourse(course)
                            setPageView('assign')
                          }}
                        >
                          Assign faculty
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          )}
          {isAdmin && pageView === 'add' && (
            <div className="col-12 col-lg-7">
              {status === 'loading' && <p>Loading courses...</p>}
              {status === 'error' && <p role="alert">Could not load courses. Refresh the page before adding a course.</p>}
              {status === 'success' && (
                <AdminCourseForm
                  token={session.token}
                  onCreated={(course) => setCourses((current) => [...current, course])}
                />
              )}
            </div>
          )}
          {isAdmin && pageView === 'faculty' && (
            <div className="col-12 col-lg-7">
              <AdminFaculty token={session.token} />
            </div>
          )}
          {isAdmin && pageView === 'users' && (
            <div className="col-12 col-lg-7">
              <AdminUsers token={session.token} />
            </div>
          )}
          {session && pageView === 'profile' && (
            <div className="col-12 col-lg-7">
              <Profile
                key={session.user.id}
                session={session}
                onUpdated={(user) => setSession((current) => ({ ...current, user }))}
                onTokenUpdated={(token) => setSession((current) => ({ ...current, token }))}
              />
            </div>
          )}
          {isAdmin && pageView === 'course-requests' && (
            <div className="col-12 col-lg-7">
              <AdminCourseRequests
                token={session.token}
                onApproved={() => setPendingRequestRefresh((current) => current + 1)}
              />
            </div>
          )}
          {editingCourse && pageView === 'edit' &&
            (isAdmin || (isFaculty && editingCourse.facultyId === session.user.id)) && (
            <div className="col-12 col-lg-7">
            <EditCourseForm
              key={editingCourse._id}
              course={editingCourse}
              token={session.token}
              onCancel={() => navigate('courses')}
              onSaved={(updated) => {
                setCourses((current) =>
                  current.map((course) => course._id === updated._id ? updated : course)
                )
                navigate('courses')
              }}
            />
            </div>
          )}
          {session && pageView === 'materials' && materialsCourse && (
            <div className="col-12 col-lg-7">
              <CourseMaterials
                key={materialsCourse._id}
                course={materialsCourse}
                token={session.token}
                canManage={isAdmin || (isFaculty && materialsCourse.facultyId === session.user.id)}
                user={session.user}
              />
              <button
                type="button"
                className="btn btn-outline-secondary mt-3"
                onClick={() => navigate('courses')}
              >
                Back to courses
              </button>
            </div>
          )}
          {isAdmin && pageView === 'assign' && assigningCourse && (
            <div className="col-12 col-lg-7">
              <AssignFaculty
                course={assigningCourse}
                token={session.token}
                onSaved={(updated) => {
                  setCourses((current) =>
                    current.map((course) => course._id === updated._id ? updated : course)
                  )
                  setAssigningCourse((current) =>
                    current?._id === updated._id ? updated : current
                  )
                }}
              />
              <button
                type="button"
                className="btn btn-outline-secondary mt-3"
                onClick={() => navigate('courses')}
              >
                Back to courses
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export default App