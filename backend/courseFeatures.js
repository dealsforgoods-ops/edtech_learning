const { ObjectId } = require('mongodb');

module.exports = function registerCourseFeatures(app, authenticate, getCourseAccess) {
  async function accessCourse(request, response, next) {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: 'Invalid course ID' });
    }
    try {
      request.courseId = new ObjectId(request.params.id);
      const access = await getCourseAccess(request.app.locals.db, request.user, request.courseId);
      if (!access.course) return response.status(access.status).json({ message: access.message });
      request.course = access.course;
      return next();
    } catch (error) {
      console.error('Course access check failed:', error);
      return response.status(500).json({ message: 'Could not check course access' });
    }
  }

  app.get('/api/courses/:id/reviews', authenticate, accessCourse, async (request, response) => {
    try {
      const reviews = await request.app.locals.db.collection('courseReviews').aggregate([
        { $match: { courseId: request.courseId } },
        { $sort: { updatedAt: -1, _id: -1 } },
        { $lookup: { from: 'users', localField: 'studentId', foreignField: '_id', as: 'student' } },
        { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
        { $project: { studentId: 1, rating: 1, comment: 1, updatedAt: 1, 'student.name': 1 } },
      ]).toArray();
      return response.json(reviews);
    } catch (error) {
      console.error('Failed to fetch course reviews:', error);
      return response.status(500).json({ message: 'Could not fetch reviews' });
    }
  });

  app.put('/api/courses/:id/review', authenticate, accessCourse, async (request, response) => {
    if (request.user.role !== 'student') {
      return response.status(403).json({ message: 'Student access required' });
    }
    const { rating, comment } = request.body || {};
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 ||
      typeof comment !== 'string' || !comment.trim() || comment.trim().length > 2000) {
      return response.status(400).json({ message: 'Choose a rating from 1 to 5 and enter a comment of up to 2000 characters' });
    }
    try {
      const review = await request.app.locals.db.collection('courseReviews').findOneAndUpdate(
        { courseId: request.courseId, studentId: request.user._id },
        { $set: { rating, comment: comment.trim(), updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() } },
        { upsert: true, returnDocument: 'after' }
      );
      return response.json(review);
    } catch (error) {
      console.error('Review save failed:', error);
      return response.status(500).json({ message: 'Could not save review' });
    }
  });

  app.get('/api/courses/:id/messages', authenticate, accessCourse, async (request, response) => {
    try {
      const messages = await request.app.locals.db.collection('courseMessages').aggregate([
        { $match: { courseId: request.courseId } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: 100 },
        { $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: 'author' } },
        { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
        { $project: { authorId: 1, text: 1, createdAt: 1, 'author.name': 1 } },
      ]).toArray();
      return response.json(messages.reverse());
    } catch (error) {
      console.error('Failed to fetch course messages:', error);
      return response.status(500).json({ message: 'Could not fetch messages' });
    }
  });

  app.post('/api/courses/:id/messages', authenticate, accessCourse, async (request, response) => {
    const { text } = request.body || {};
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) {
      return response.status(400).json({ message: 'Enter a message of up to 2000 characters' });
    }
    try {
      const message = {
        courseId: request.courseId,
        authorId: request.user._id,
        text: text.trim(),
        createdAt: new Date(),
      };
      const result = await request.app.locals.db.collection('courseMessages').insertOne(message);
      return response.status(201).json({ _id: result.insertedId });
    } catch (error) {
      console.error('Message creation failed:', error);
      return response.status(500).json({ message: 'Could not send message' });
    }
  });

  app.get('/api/courses/:id/progress', authenticate, accessCourse, async (request, response) => {
    if (request.user.role !== 'student') {
      return response.status(403).json({ message: 'Student access required' });
    }
    try {
      const progress = await request.app.locals.db.collection('lessonProgress').find(
        { courseId: request.courseId, studentId: request.user._id, completed: true },
        { projection: { materialId: 1 } }
      ).toArray();
      return response.json(progress);
    } catch (error) {
      console.error('Failed to fetch lesson progress:', error);
      return response.status(500).json({ message: 'Could not fetch lesson progress' });
    }
  });

  app.put('/api/courses/:id/progress/:materialId', authenticate, accessCourse, async (request, response) => {
    if (request.user.role !== 'student') {
      return response.status(403).json({ message: 'Student access required' });
    }
    if (!/^[a-f\d]{24}$/i.test(request.params.materialId) ||
      typeof request.body?.completed !== 'boolean') {
      return response.status(400).json({ message: 'Invalid material ID or completion status' });
    }
    const materialId = new ObjectId(request.params.materialId);
    if (!Array.isArray(request.course.materials) ||
      !request.course.materials.some((item) => item._id instanceof ObjectId && item._id.equals(materialId))) {
      return response.status(404).json({ message: 'Material not found' });
    }
    try {
      await request.app.locals.db.collection('lessonProgress').updateOne(
        { courseId: request.courseId, studentId: request.user._id, materialId },
        { $set: { completed: request.body.completed, updatedAt: new Date() } },
        { upsert: true }
      );
      return response.json({ materialId, completed: request.body.completed });
    } catch (error) {
      console.error('Failed to save lesson progress:', error);
      return response.status(500).json({ message: 'Could not save lesson progress' });
    }
  });
};
