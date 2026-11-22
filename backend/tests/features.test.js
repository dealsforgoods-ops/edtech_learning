const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId, GridFSBucket } = require('mongodb');
const bcrypt = require('bcryptjs');
const { validFileSize } = require('../courseFiles');
require('dotenv').config({ quiet: true });

process.env.JWT_SECRET = 'isolated-integration-test-secret';
const app = require('../server');

test('course features respect roles, persist data, and protect files', { timeout: 120000 }, async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  const databaseName = `edtech_test_${process.pid}_${Date.now()}`;
  let server;
  await client.connect();
  const db = client.db(databaseName);
  try {
    app.locals.db = db;
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('courseReviews').createIndex({ studentId: 1, courseId: 1 }, { unique: true });
    await db.collection('lessonProgress').createIndex({ studentId: 1, courseId: 1, materialId: 1 }, { unique: true });

    const hash = await bcrypt.hash('test-password-123', 4);
    const users = ['admin', 'student', 'student', 'faculty', 'faculty'].map((role, index) => ({
      _id: new ObjectId(), name: `Test ${index}`, email: `test${index}@example.test`,
      passwordHash: hash, role, status: 'active', createdAt: new Date(),
    }));
    await db.collection('users').insertMany(users);
    const [admin, student, outsider, faculty, unassigned] = users;
    const lessonId = new ObjectId();
    const course = {
      _id: new ObjectId(), title: 'Test course', category: 'Test', description: 'Test',
      facultyId: faculty._id,
      materials: [{ _id: lessonId, type: 'text', title: 'Lesson', content: 'Private lesson' }],
    };
    await db.collection('courses').insertOne(course);
    await db.collection('courseRequests').insertOne({
      studentId: student._id, courseId: course._id, status: 'approved',
    });

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function call(path, token, method = 'GET', body, extraHeaders = {}) {
      const headers = { ...extraHeaders };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined && !Buffer.isBuffer(body)) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
      }
      return fetch(base + path, { method, headers, body });
    }
    async function login(user) {
      const response = await call('/login', null, 'POST', { email: user.email, password: 'test-password-123' });
      assert.equal(response.status, 200);
      return (await response.json()).token;
    }
    let [adminToken, studentToken, outsiderToken, facultyToken, unassignedToken] =
      await Promise.all(users.map(login));
    const id = course._id.toString();
    const lesson = lessonId.toString();

    assert.equal((await call('/admin/users')).status, 401);
    assert.equal((await call('/admin/users', studentToken)).status, 403);
    const adminUsersResponse = await call('/admin/users', adminToken);
    assert.equal(adminUsersResponse.status, 200);
    const listedUsers = await adminUsersResponse.json();
    assert.equal(listedUsers.length, 4);
    assert.ok(listedUsers.every((user) => !('passwordHash' in user)));
    assert.equal((await call('/me', studentToken, 'PATCH', { name: 'Updated learner' })).status, 200);
    assert.equal((await call('/me', studentToken, 'PATCH', { name: ' ' })).status, 400);
    assert.equal((await call('/me/password', studentToken, 'PATCH', {
      currentPassword: 'wrong', newPassword: 'updated-password-123',
    })).status, 400);
    const passwordUpdate = await call('/me/password', studentToken, 'PATCH', {
      currentPassword: 'test-password-123', newPassword: 'updated-password-123',
    });
    assert.equal(passwordUpdate.status, 200);
    const newToken = (await passwordUpdate.json()).token;
    assert.equal((await call('/me', studentToken)).status, 401);
    studentToken = newToken;
    assert.equal((await call('/me', studentToken)).status, 200);
    assert.equal((await call('/login', null, 'POST', {
      email: student.email, password: 'updated-password-123',
    })).status, 200);

    assert.equal((await call(`/courses/${id}/reviews`, outsiderToken)).status, 403);
    assert.equal((await call(`/courses/${id}/review`, facultyToken, 'PUT', { rating: 5, comment: 'Good' })).status, 403);
    assert.equal((await call(`/courses/${id}/review`, studentToken, 'PUT', { rating: 6, comment: 'Good' })).status, 400);
    assert.equal((await call(`/courses/${id}/review`, studentToken, 'PUT', { rating: 5, comment: 'Good' })).status, 200);
    assert.equal((await call(`/courses/${id}/review`, studentToken, 'PUT', { rating: 3, comment: 'Updated' })).status, 200);
    const reviews = await (await call(`/courses/${id}/reviews`, facultyToken)).json();
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].rating, 3);
    assert.equal(reviews[0].student.name, 'Updated learner');
    assert.ok(!('email' in reviews[0].student));

    assert.equal((await call(`/courses/${id}/messages`, unassignedToken)).status, 403);
    assert.equal((await call(`/courses/${id}/messages`, studentToken, 'POST', { text: '  Hello class  ' })).status, 201);
    assert.equal((await call(`/courses/${id}/messages`, facultyToken, 'POST', { text: 'Welcome' })).status, 201);
    const messages = await (await call(`/courses/${id}/messages`, adminToken)).json();
    assert.deepEqual(messages.map((message) => message.text), ['Hello class', 'Welcome']);

    assert.equal((await call(`/courses/${id}/progress/${lesson}`, outsiderToken, 'PUT', { completed: true })).status, 403);
    assert.equal((await call(`/courses/${id}/progress/${lesson}`, studentToken, 'PUT', { completed: true })).status, 200);
    let progress = await (await call(`/courses/${id}/progress`, studentToken)).json();
    assert.equal(progress[0].materialId, lesson);
    assert.equal((await call(`/courses/${id}/progress/${lesson}`, studentToken, 'PUT', { completed: false })).status, 200);
    progress = await (await call(`/courses/${id}/progress`, studentToken)).json();
    assert.equal(progress.length, 0);

    const uploadPath = `/courses/${id}/materials/files?title=Document&filename=lesson.pdf`;
    const data = Buffer.from('%PDF-1.4 test document');
    assert.equal((await call(uploadPath, studentToken, 'POST', data, { 'Content-Type': 'application/octet-stream' })).status, 403);
    assert.equal((await call(uploadPath, unassignedToken, 'POST', data, { 'Content-Type': 'application/octet-stream' })).status, 403);
    const uploaded = await call(uploadPath, facultyToken, 'POST', data, { 'Content-Type': 'application/octet-stream' });
    assert.equal(uploaded.status, 201);
    const material = await uploaded.json();
    assert.equal(material.type, 'file');
    assert.equal((await call(`/courses/${id}/materials/${material._id}/file`, outsiderToken)).status, 403);
    const download = await call(`/courses/${id}/materials/${material._id}/file`, studentToken);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-disposition'), 'attachment');
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), data);
    assert.equal((await call(`/courses/${id}/materials/${material._id}/file`, facultyToken, 'PATCH', { title: 'Revised' })).status, 200);
    const publicCourses = await (await call('/courses')).json();
    assert.ok(!('materials' in publicCourses[0]));
    assert.equal((await new GridFSBucket(db, { bucketName: 'courseFiles' }).find({}).toArray()).length, 1);
    assert.equal((await call(`/courses/${id}/materials/files?title=Bad&filename=bad.exe`, adminToken, 'POST', data, {
      'Content-Type': 'application/octet-stream',
    })).status, 400);
    assert.equal(validFileSize(0), false);
    assert.equal(validFileSize(1), true);
    assert.equal(validFileSize(50 * 1024 * 1024), true);
    assert.equal(validFileSize(50 * 1024 * 1024 + 1), false);
    for (let index = 0; index < 3; index++) {
      assert.equal((await call(`/courses/${id}/materials`, adminToken, 'POST', {
        title: `Extra ${index}`, type: 'text', content: 'Test',
      })).status, 201);
    }
    assert.equal((await call(uploadPath, adminToken, 'POST', data, { 'Content-Type': 'application/octet-stream' })).status, 409);
    assert.equal((await new GridFSBucket(db, { bucketName: 'courseFiles' }).find({}).toArray()).length, 1);
    assert.equal((await call(`/courses/${id}/materials/${material._id}`, outsiderToken, 'DELETE')).status, 403);
    assert.equal((await call(`/courses/${id}/materials/${material._id}`, unassignedToken, 'DELETE')).status, 404);
    assert.equal((await call(`/courses/${id}/materials/${material._id}`, facultyToken, 'DELETE')).status, 200);
    assert.equal((await new GridFSBucket(db, { bucketName: 'courseFiles' }).find({}).toArray()).length, 0);
    assert.equal((await call(`/courses/${id}/materials/${material._id}/file`, studentToken)).status, 404);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.dropDatabase();
    await client.close();
  }
});
