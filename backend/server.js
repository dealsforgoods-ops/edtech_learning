require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing from the environment');
}
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error('MONGO_URI is missing from the environment');
}

app.get('/api/health', (request, response) => {
  response.json({ status: 'ok', application: 'EdTech ELearn API' });
});

app.post('/api/login', async (request, response) => {
  const { email, password } = request.body || {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return response.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await request.app.locals.db.collection('users').findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status !== 'active') {
      return response.status(403).json({ message: 'Account is not active' });
    }

    const token = jwt.sign(
      { sub: user._id.toString(), version: user.tokenVersion || 0 },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    return response.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login failed:', error);
    return response.status(500).json({ message: 'Could not log in' });
  }
});

async function authenticate(request, response, next) {
  const header = request.get('Authorization') || '';
  const match = /^Bearer (\S+)$/i.exec(header);

  if (!match) {
    return response.status(401).json({ message: 'Authentication required' });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return response.status(401).json({ message: 'Invalid or expired token' });
    }
    console.error('Token verification failed:', error);
    return response.status(500).json({ message: 'Authentication failed' });
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.sub !== 'string' ||
    !/^[a-f\d]{24}$/i.test(payload.sub)
  ) {
    return response.status(401).json({ message: 'Invalid token' });
  }

  try {
    const user = await request.app.locals.db.collection('users').findOne(
      { _id: new ObjectId(payload.sub), status: 'active' },
      { projection: { name: 1, email: 1, role: 1, tokenVersion: 1 } }
    );

    if (!user) {
      return response.status(401).json({ message: 'Account unavailable' });
    }
    if ((payload.version === undefined ? 0 : payload.version) !== (user.tokenVersion || 0)) {
      return response.status(401).json({ message: 'Invalid or expired token' });
    }

    request.user = user;
    return next();
  } catch (error) {
    console.error('Authentication lookup failed:', error);
    return response.status(500).json({ message: 'Authentication failed' });
  }
}

function requireAdmin(request, response, next) {
  if (request.user.role !== 'admin') {
    return response.status(403).json({ message: 'Admin access required' });
  }

  return next();
}

app.get('/api/admin/users', authenticate, requireAdmin, async (request, response) => {
  try {
    const users = await request.app.locals.db.collection('users')
      .find(
        { role: { $in: ['student', 'faculty'] } },
        { projection: { name: 1, email: 1, role: 1, status: 1, createdAt: 1 } }
      )
      .sort({ name: 1, _id: 1 })
      .toArray();
    return response.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return response.status(500).json({ message: 'Could not fetch users' });
  }
});

app.get('/api/admin/faculty/pending', authenticate, requireAdmin, async (request, response) => {
  try {
    const faculty = await request.app.locals.db.collection('users')
      .find(
        { role: 'faculty', status: 'pending' },
        { projection: { name: 1, email: 1, status: 1, createdAt: 1 } }
      )
      .toArray();

    return response.json(faculty);
  } catch (error) {
    console.error('Failed to fetch pending faculty:', error);
    return response.status(500).json({ message: 'Could not fetch pending faculty' });
  }
});

app.get('/api/admin/faculty/active', authenticate, requireAdmin, async (request, response) => {
  try {
    const faculty = await request.app.locals.db.collection('users')
      .find(
        { role: 'faculty', status: 'active' },
        { projection: { name: 1, email: 1 } }
      )
      .toArray();

    return response.json(faculty);
  } catch (error) {
    console.error('Failed to fetch active faculty:', error);
    return response.status(500).json({ message: 'Could not fetch active faculty' });
  }
});

app.patch('/api/admin/faculty/:id/approve', authenticate, requireAdmin, async (request, response) => {
  const { id } = request.params;

  if (!/^[a-f\d]{24}$/i.test(id)) {
    return response.status(400).json({ message: 'Invalid faculty ID' });
  }

  try {
    const faculty = await request.app.locals.db.collection('users').findOneAndUpdate(
      {
        _id: new ObjectId(id),
        role: 'faculty',
        status: 'pending',
      },
      { $set: { status: 'active' } },
      {
        returnDocument: 'after',
        projection: { name: 1, email: 1, role: 1, status: 1 },
      }
    );

    if (!faculty) {
      return response.status(404).json({ message: 'Pending faculty account not found' });
    }

    return response.json(faculty);
  } catch (error) {
    console.error('Faculty approval failed:', error);
    return response.status(500).json({ message: 'Could not approve faculty' });
  }
});

app.get('/api/me', authenticate, (request, response) => {
  response.json(request.user);
});

app.patch('/api/me', authenticate, async (request, response) => {
  const { name } = request.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return response.status(400).json({ message: 'Enter a name of up to 100 characters' });
  }

  try {
    const user = await request.app.locals.db.collection('users').findOneAndUpdate(
      { _id: request.user._id, status: 'active' },
      { $set: { name: name.trim() } },
      { returnDocument: 'after', projection: { name: 1, email: 1, role: 1 } }
    );
    if (!user) return response.status(401).json({ message: 'Account unavailable' });
    return response.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    console.error('Profile update failed:', error);
    return response.status(500).json({ message: 'Could not update profile' });
  }
});

app.patch('/api/me/password', authenticate, async (request, response) => {
  const { currentPassword, newPassword } = request.body || {};
  if (
    typeof currentPassword !== 'string' || typeof newPassword !== 'string' ||
    newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72
  ) {
    return response.status(400).json({ message: 'Enter a new password of at least 8 characters and at most 72 UTF-8 bytes' });
  }

  try {
    const users = request.app.locals.db.collection('users');
    const user = await users.findOne({ _id: request.user._id, status: 'active' });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return response.status(400).json({ message: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updated = await users.findOneAndUpdate(
      { _id: user._id, status: 'active', passwordHash: user.passwordHash },
      { $set: { passwordHash }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after', projection: { tokenVersion: 1 } }
    );
    if (!updated) {
      return response.status(409).json({ message: 'Account changed. Please try again' });
    }
    const token = jwt.sign(
      { sub: user._id.toString(), version: updated.tokenVersion },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    return response.json({ message: 'Password updated', token });
  } catch (error) {
    console.error('Password update failed:', error);
    return response.status(500).json({ message: 'Could not update password' });
  }
});

function validateCourse(body) {
  const { title, category, description } = body || {};

  if (
    typeof title !== 'string' ||
    typeof category !== 'string' ||
    typeof description !== 'string'
  ) {
    return { error: 'All course fields are required' };
  }

  const course = {
    title: title.trim(),
    category: category.trim(),
    description: description.trim(),
  };

  if (
    !course.title || course.title.length > 100 ||
    !course.category || course.category.length > 100 ||
    !course.description || course.description.length > 2000
  ) {
    return { error: 'Invalid course details' };
  }

  return { course };
}

function validateMaterial(body) {
  const { title, type, content } = body || {};

  if (
    typeof title !== 'string' ||
    typeof type !== 'string' ||
    typeof content !== 'string'
  ) {
    return { error: 'Title, type and content are required' };
  }

  const cleanTitle = title.trim();
  const cleanContent = content.trim();

  if (
    !cleanTitle ||
    cleanTitle.length > 100 ||
    !cleanContent ||
    !['text', 'link'].includes(type)
  ) {
    return { error: 'Invalid material details' };
  }

  const maxBytes = type === 'text' ? 10000 : 2048;

  if (Buffer.byteLength(cleanContent, 'utf8') > maxBytes) {
    return { error: 'Material content is too long' };
  }

  if (type === 'link') {
    let url;

    try {
      url = new URL(cleanContent);
    } catch (error) {
      if (error instanceof TypeError) {
        return { error: 'Enter a valid HTTP or HTTPS link' };
      }
      throw error;
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return { error: 'Enter a valid HTTP or HTTPS link without credentials' };
    }
  }

  return {
    material: { title: cleanTitle, type, content: cleanContent },
  };
}

async function getCourseAccess(db, user, courseId) {
  const course = await db.collection('courses').findOne(
    { _id: courseId },
    { projection: { facultyId: 1, materials: 1 } }
  );
  if (!course) return { status: 404, message: 'Course not found' };

  let allowed = user.role === 'admin';
  if (user.role === 'faculty') {
    allowed = course.facultyId instanceof ObjectId && course.facultyId.equals(user._id);
  } else if (user.role === 'student') {
    allowed = Boolean(await db.collection('courseRequests').findOne({
      studentId: user._id, courseId, status: 'approved',
    }));
  }
  if (!allowed) return { status: 403, message: 'Course access required' };
  return { course };
}

require('./courseFeatures')(app, authenticate, getCourseAccess);
require('./courseFiles')(app, authenticate, getCourseAccess);
require('./chunkedFiles')(app, authenticate, getCourseAccess);

app.post('/api/courses', authenticate, requireAdmin, async (request, response) => {
  const { course, error } = validateCourse(request.body);

  if (error) {
    return response.status(400).json({ message: error });
  }
  // The course has already been validated by validateCourse, so this check is redundant and can be removed.

  try {
    const result = await request.app.locals.db.collection('courses').insertOne(course);

    return response.status(201).json({
      _id: result.insertedId,
      ...course,
    });
  } catch (error) {
    console.error('Course creation failed:', error);
    return response.status(500).json({ message: 'Could not create course' });
  }
});

app.get('/api/courses', async (request, response) => {
  try {
    const courses = await request.app.locals.db
      .collection('courses')
      .find({}, { projection: { materials: 0 } })
      .toArray();

    response.json(courses);
  } catch (error) {
    console.error('Failed to fetch courses:', error.message);
    response.status(500).json({ message: 'Could not fetch courses' });
  }
});

app.put('/api/courses/:id', authenticate, async (request, response) => {
  const { id } = request.params;

  if (!['admin', 'faculty'].includes(request.user.role)) {
    return response.status(403).json({ message: 'Admin or faculty access required' });
  }

  if (!/^[a-f\d]{24}$/i.test(id)) {
    return response.status(400).json({ message: 'Invalid course ID' });
  }

  const { course, error } = validateCourse(request.body);

  if (error) {
    return response.status(400).json({ message: error });
  }

  try {
    const filter = { _id: new ObjectId(id) };

    if (request.user.role === 'faculty') {
      filter.facultyId = request.user._id;
    }

    const updated = await request.app.locals.db.collection('courses')
      .findOneAndUpdate(
        filter,
        { $set: course },
        { returnDocument: 'after', projection: { materials: 0 } }
      );

    if (!updated) {
      return response.status(404).json({
        message: 'Course not found or not assigned to you',
      });
    }

    return response.json(updated);
  } catch (error) {
    console.error('Course update failed:', error);
    return response.status(500).json({ message: 'Could not update course' });
  }
});

app.post('/api/register', async (request, response) => {
  const { name, email, password, role } = request.body || {};

  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof role !== 'string'
  ) {
    return response.status(400).json({ message: 'All fields are required' });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  if (
    cleanName.length < 1 ||
    cleanName.length > 100 ||
    cleanEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72 ||
    !['student', 'faculty'].includes(role)
  ) {
    return response.status(400).json({ message: 'Invalid registration details' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const status = role === 'faculty' ? 'pending' : 'active';

    const result = await request.app.locals.db.collection('users').insertOne({
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      role,
      status,
      createdAt: new Date(),
    });

    return response.status(201).json({
      id: result.insertedId,
      name: cleanName,
      email: cleanEmail,
      role,
      status,
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ message: 'Email is already registered' });
    }

    console.error('Registration failed:', error);
    return response.status(500).json({ message: 'Could not register user' });
  }
});

app.get('/api/admin/course-requests/pending', authenticate, requireAdmin, async (request, response) => {
  try {
    const requests = await request.app.locals.db.collection('courseRequests')
      .aggregate([
        { $match: { status: 'pending' } },
        { $sort: { createdAt: 1, _id: 1 } },
        {
          $lookup: {
            from: 'users',
            localField: 'studentId',
            foreignField: '_id',
            as: 'student',
          },
        },
        { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'courses',
            localField: 'courseId',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            status: 1,
            createdAt: 1,
            'student._id': 1,
            'student.name': 1,
            'student.email': 1,
            'course._id': 1,
            'course.title': 1,
          },
        },
      ])
      .toArray();

    return response.json(requests);
  } catch (error) {
    console.error('Failed to fetch course requests:', error);
    return response.status(500).json({ message: 'Could not fetch course requests' });
  }
});

app.patch('/api/admin/course-requests/:id/approve', authenticate, requireAdmin, async (request, response) => {
  const { id } = request.params;

  if (!/^[a-f\d]{24}$/i.test(id)) {
    return response.status(400).json({ message: 'Invalid request ID' });
  }

  try {
    const db = request.app.locals.db;
    const requestId = new ObjectId(id);
    const requests = db.collection('courseRequests');

    const pending = await requests.findOne({
      _id: requestId,
      status: 'pending',
    });

    if (!pending) {
      return response.status(404).json({ message: 'Pending request not found' });
    }

    const [student, course] = await Promise.all([
      db.collection('users').findOne({
        _id: pending.studentId,
        role: 'student',
        status: 'active',
      }),
      db.collection('courses').findOne({ _id: pending.courseId }),
    ]);

    if (!student || !course) {
      return response.status(409).json({ message: 'Student or course is unavailable' });
    }

    const approved = await requests.findOneAndUpdate(
      { _id: requestId, status: 'pending' },
      {
        $set: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: request.user._id,
        },
      },
      { returnDocument: 'after' }
    );

    if (!approved) {
      return response.status(409).json({ message: 'Request is no longer pending' });
    }

    return response.json(approved);
  } catch (error) {
    console.error('Course request approval failed:', error);
    return response.status(500).json({ message: 'Could not approve course request' });
  }
});

app.get('/api/me/course-requests', authenticate, async (request, response) => {
  if (request.user.role !== 'student') {
    return response.status(403).json({ message: 'Student access required' });
  }

  try {
    const requests = await request.app.locals.db.collection('courseRequests')
      .find(
        { studentId: request.user._id },
        { projection: { courseId: 1, status: 1 } }
      )
      .toArray();

    return response.json(requests);
  } catch (error) {
    console.error('Failed to fetch student course requests:', error);
    return response.status(500).json({ message: 'Could not fetch course requests' });
  }
});

async function connectDatabase(options) {
  const client = new MongoClient(MONGO_URI, options);

  try {
    await client.connect();

    await client.db('edtech-elearn')
      .collection('users')
      .createIndex({ email: 1 }, { unique: true });

    console.log('User email index is ready');
    await client.db('edtech-elearn')
      .collection('courseRequests')
      .createIndex({ studentId: 1, courseId: 1 }, { unique: true });

    console.log('Course request index is ready');
    await client.db('edtech-elearn')
      .collection('courseReviews')
      .createIndex({ studentId: 1, courseId: 1 }, { unique: true });
    await client.db('edtech-elearn')
      .collection('lessonProgress')
      .createIndex({ studentId: 1, courseId: 1, materialId: 1 }, { unique: true });
    await client.db('edtech-elearn')
      .collection('courseMessages')
      .createIndex({ courseId: 1, createdAt: -1, _id: -1 });
    await client.db('edtech-elearn')
      .collection('fileUploadSessions')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await client.db('edtech-elearn')
      .collection('fileUploadChunks')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await client.db('edtech-elearn')
      .collection('fileUploadChunks')
      .createIndex({ uploadId: 1, index: 1 }, { unique: true });
    return client;
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    await client.close();
    throw error;
  }
}

async function startServer() {
  try {
    const client = await connectDatabase();
    app.locals.db = client.db('edtech-elearn');
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`EdTech ELearn API is running on port ${PORT}`);
    });
  } catch (error) {
    process.exitCode = 1;
  }
}

app.patch('/api/admin/courses/:id/faculty', authenticate, requireAdmin, async (request, response) => {
  const { id } = request.params;
  const { facultyId } = request.body || {};

  if (
    !/^[a-f\d]{24}$/i.test(id) ||
    typeof facultyId !== 'string' ||
    !/^[a-f\d]{24}$/i.test(facultyId)
  ) {
    return response.status(400).json({ message: 'Invalid course or faculty ID' });
  }

  try {
    const faculty = await request.app.locals.db.collection('users').findOne({
      _id: new ObjectId(facultyId),
      role: 'faculty',
      status: 'active',
    });

    if (!faculty) {
      return response.status(404).json({ message: 'Active faculty account not found' });
    }

    const course = await request.app.locals.db.collection('courses').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { facultyId: faculty._id } },
      { returnDocument: 'after', projection: { materials: 0 } }
    );

    if (!course) {
      return response.status(404).json({ message: 'Course not found' });
    }

    return response.json(course);
  } catch (error) {
    console.error('Faculty assignment failed:', error);
    return response.status(500).json({ message: 'Could not assign faculty' });
  }
});

app.post('/api/courses/:id/requests', authenticate, async (request, response) => {
  if (request.user.role !== 'student') {
    return response.status(403).json({ message: 'Student access required' });
  }

  const { id } = request.params;

  if (!/^[a-f\d]{24}$/i.test(id)) {
    return response.status(400).json({ message: 'Invalid course ID' });
  }

  try {
    const db = request.app.locals.db;
    const courseId = new ObjectId(id);

    const course = await db.collection('courses').findOne(
      { _id: courseId },
      { projection: { _id: 1 } }
    );

    if (!course) {
      return response.status(404).json({ message: 'Course not found' });
    }

    const courseRequest = {
      studentId: request.user._id,
      courseId,
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await db.collection('courseRequests').insertOne(courseRequest);

    return response.status(201).json({
      _id: result.insertedId,
      ...courseRequest,
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ message: 'You already requested this course' });
    }

    console.error('Course request failed:', error);
    return response.status(500).json({ message: 'Could not request course access' });
  }
});

app.get('/api/courses/:id/materials', authenticate, async (request, response) => {
  const { id } = request.params;

  if (!/^[a-f\d]{24}$/i.test(id)) {
    return response.status(400).json({ message: 'Invalid course ID' });
  }

  try {
    const db = request.app.locals.db;
    const courseId = new ObjectId(id);

    const access = await getCourseAccess(db, request.user, courseId);
    if (!access.course) return response.status(access.status).json({ message: access.message });
    const { course } = access;

    const materials = course.materials === undefined ? [] : course.materials;

    if (!Array.isArray(materials)) {
      throw new Error('Invalid course materials data');
    }

    return response.json(materials);
  } catch (error) {
    console.error('Failed to fetch course materials:', error);
    return response.status(500).json({ message: 'Could not fetch course materials' });
  }
});

app.post('/api/courses/:id/materials', authenticate, async (request, response) => {
  const { id } = request.params;

  if (!['admin', 'faculty'].includes(request.user.role)) {
    return response.status(403).json({ message: 'Admin or faculty access required' });
  }

  if (!/^[a-f\d]{24}$/i.test(id)) {
    return response.status(400).json({ message: 'Invalid course ID' });
  }

  try {
    const { material, error } = validateMaterial(request.body);

    if (error) {
      return response.status(400).json({ message: error });
    }

    const courses = request.app.locals.db.collection('courses');
    const courseId = new ObjectId(id);
    const newMaterial = {
      _id: new ObjectId(),
      ...material,
      createdAt: new Date(),
      createdBy: request.user._id,
    };

    const filter = {
      _id: courseId,
      $expr: {
        $lt: [{ $size: { $ifNull: ['$materials', []] } }, 5],
      },
    };

    if (request.user.role === 'faculty') {
      filter.facultyId = request.user._id;
    }

    const updated = await courses.findOneAndUpdate(
      filter,
      { $push: { materials: newMaterial } },
      { returnDocument: 'after', projection: { _id: 1 } }
    );

    if (!updated) {
      const current = await courses.findOne(
        { _id: courseId },
        { projection: { facultyId: 1, materials: 1 } }
      );

      if (!current) {
        return response.status(404).json({ message: 'Course not found' });
      }

      if (
        request.user.role === 'faculty' &&
        (!(current.facultyId instanceof ObjectId) ||
          !current.facultyId.equals(request.user._id))
      ) {
        return response.status(403).json({ message: 'Course access required' });
      }

      if (current.materials !== undefined && !Array.isArray(current.materials)) {
        throw new Error('Invalid course materials data');
      }

      if (current.materials && current.materials.length >= 5) {
        return response.status(409).json({ message: 'Course already has five materials' });
      }

      return response.status(409).json({ message: 'Course changed. Please try again' });
    }

    return response.status(201).json(newMaterial);
  } catch (error) {
    console.error('Material creation failed:', error);
    return response.status(500).json({ message: 'Could not create material' });
  }
});

app.put('/api/courses/:id/materials/:materialId', authenticate, async (request, response) => {
  const { id, materialId } = request.params;

  if (!['admin', 'faculty'].includes(request.user.role)) {
    return response.status(403).json({ message: 'Admin or faculty access required' });
  }

  if (!/^[a-f\d]{24}$/i.test(id) || !/^[a-f\d]{24}$/i.test(materialId)) {
    return response.status(400).json({ message: 'Invalid course or material ID' });
  }

  try {
    const { material, error } = validateMaterial(request.body);

    if (error) {
      return response.status(400).json({ message: error });
    }

    const materialObjectId = new ObjectId(materialId);
    const filter = {
      _id: new ObjectId(id),
      'materials._id': materialObjectId,
    };

    if (request.user.role === 'faculty') {
      filter.facultyId = request.user._id;
    }

    const updated = await request.app.locals.db.collection('courses')
      .findOneAndUpdate(
        filter,
        {
          $set: {
            'materials.$.title': material.title,
            'materials.$.type': material.type,
            'materials.$.content': material.content,
            'materials.$.updatedAt': new Date(),
            'materials.$.updatedBy': request.user._id,
          },
        },
        { returnDocument: 'after', projection: { materials: 1 } }
      );

    if (!updated) {
      return response.status(404).json({
        message: 'Course or material not found, or not assigned to you',
      });
    }

    const saved = updated.materials.find((item) => item._id.equals(materialObjectId));

    if (!saved) {
      throw new Error('Updated material was not returned');
    }

    return response.json(saved);
  } catch (error) {
    console.error('Material update failed:', error);
    return response.status(500).json({ message: 'Could not update material' });
  }
});

if (require.main === module) startServer();

module.exports = app;
module.exports.connectDatabase = connectDatabase;