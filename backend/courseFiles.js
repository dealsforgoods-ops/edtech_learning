const { ObjectId, GridFSBucket } = require('mongodb');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const FILE_TYPES = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function validFileSize(length) {
  return Number.isSafeInteger(length) && length >= 1 && length <= MAX_FILE_BYTES;
}

module.exports = function registerCourseFiles(app, authenticate, getCourseAccess) {
  app.post('/api/courses/:id/materials/files', authenticate, async (request, response) => {
    if (!['admin', 'faculty'].includes(request.user.role)) {
      return response.status(403).json({ message: 'Admin or faculty access required' });
    }
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      return response.status(400).json({ message: 'Invalid course ID' });
    }
    const { title, filename } = request.query;
    const length = Number(request.get('Content-Length'));
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 ||
      typeof filename !== 'string' || filename.length > 200 ||
      filename !== path.basename(filename) || filename.includes('\\') ||
      !FILE_TYPES[path.extname(filename).toLowerCase()]) {
      return response.status(400).json({ message: 'Enter a title and select a supported file' });
    }
    if (!validFileSize(length)) {
      return response.status(413).json({ message: 'File must be between 1 byte and 50 MB' });
    }
    if (!request.is('application/octet-stream')) {
      return response.status(415).json({ message: 'Expected a binary file upload' });
    }

    const db = request.app.locals.db;
    const courseId = new ObjectId(request.params.id);
    const bucket = new GridFSBucket(db, { bucketName: 'courseFiles' });
    let fileId;
    let complete = false;
    try {
      const access = await getCourseAccess(db, request.user, courseId);
      if (!access.course) return response.status(access.status).json({ message: access.message });
      if (access.course.materials !== undefined && !Array.isArray(access.course.materials)) {
        throw new Error('Invalid course materials data');
      }
      if (access.course.materials?.length >= 5) {
        return response.status(409).json({ message: 'Course already has five materials' });
      }

      const upload = bucket.openUploadStream(filename);
      fileId = upload.id;
      let total = 0;
      const limiter = new Transform({
        transform(chunk, encoding, callback) {
          total += chunk.length;
          if (total > length || total > MAX_FILE_BYTES) {
            return callback(new Error('File exceeds declared size'));
          }
          return callback(null, chunk);
        },
      });
      try {
        await pipeline(request, limiter, upload);
      } catch (error) {
        try {
          await upload.abort();
        } catch (cleanupError) {
          console.error('Failed to clean up incomplete file:', cleanupError);
        }
        throw error;
      }
      complete = true;
      if (total !== length) throw new Error('File size does not match Content-Length');

      const material = {
        _id: new ObjectId(),
        title: title.trim(),
        type: 'file',
        content: filename,
        fileId,
        createdAt: new Date(),
        createdBy: request.user._id,
      };

      const filter = {
        _id: courseId,
        $expr: { $lt: [{ $size: { $ifNull: ['$materials', []] } }, 5] },
      };
      if (request.user.role === 'faculty') filter.facultyId = request.user._id;
      const updated = await db.collection('courses').findOneAndUpdate(
        filter, { $push: { materials: material } },
        { returnDocument: 'after', projection: { _id: 1 } }
      );
      if (!updated) {
        await bucket.delete(fileId);
        complete = false;
        return response.status(409).json({ message: 'Course access or material limit changed. Refresh and try again' });
      }
      return response.status(201).json(material);
    } catch (error) {
      if (complete) {
        try {
          const linked = await db.collection('courses').findOne(
            { _id: courseId, 'materials.fileId': fileId },
            { projection: { _id: 1 } }
          );
          if (!linked) await bucket.delete(fileId);
        } catch (cleanupError) {
          console.error('Could not verify or clean up uploaded file:', cleanupError);
        }
      }
      console.error('File upload failed:', error);
      if (!response.headersSent && !response.destroyed) {
        return response.status(500).json({ message: 'Could not upload file' });
      }
    }
  });

  app.patch('/api/courses/:id/materials/:materialId/file', authenticate, async (request, response) => {
    if (!['admin', 'faculty'].includes(request.user.role)) {
      return response.status(403).json({ message: 'Admin or faculty access required' });
    }
    if (!/^[a-f\d]{24}$/i.test(request.params.id) ||
      !/^[a-f\d]{24}$/i.test(request.params.materialId) ||
      typeof request.body?.title !== 'string' ||
      !request.body.title.trim() || request.body.title.trim().length > 100) {
      return response.status(400).json({ message: 'Invalid course, material or title' });
    }
    try {
      const materialId = new ObjectId(request.params.materialId);
      const filter = { _id: new ObjectId(request.params.id), materials: { $elemMatch: { _id: materialId, type: 'file' } } };
      if (request.user.role === 'faculty') filter.facultyId = request.user._id;
      const course = await request.app.locals.db.collection('courses').findOneAndUpdate(
        filter,
        { $set: { 'materials.$.title': request.body.title.trim(), 'materials.$.updatedAt': new Date(), 'materials.$.updatedBy': request.user._id } },
        { returnDocument: 'after', projection: { materials: 1 } }
      );
      if (!course) return response.status(404).json({ message: 'File not found or not assigned to you' });
      return response.json(course.materials.find((item) => item._id.equals(materialId)));
    } catch (error) {
      console.error('File title update failed:', error);
      return response.status(500).json({ message: 'Could not update file title' });
    }
  });

  app.get('/api/courses/:id/materials/:materialId/file', authenticate, async (request, response) => {
    if (!/^[a-f\d]{24}$/i.test(request.params.id) || !/^[a-f\d]{24}$/i.test(request.params.materialId)) {
      return response.status(400).json({ message: 'Invalid course or material ID' });
    }
    try {
      const db = request.app.locals.db;
      const access = await getCourseAccess(db, request.user, new ObjectId(request.params.id));
      if (!access.course) return response.status(access.status).json({ message: access.message });
      if (!Array.isArray(access.course.materials)) {
        return response.status(404).json({ message: 'File not found' });
      }
      const material = access.course.materials.find((item) =>
        item._id instanceof ObjectId && item._id.equals(new ObjectId(request.params.materialId)) &&
        item.type === 'file' && item.fileId instanceof ObjectId
      );
      if (!material) return response.status(404).json({ message: 'File not found' });
      const stored = await db.collection('courseFiles.files').findOne({ _id: material.fileId });
      if (!stored) return response.status(404).json({ message: 'Stored file not found' });
      const extension = path.extname(material.content).toLowerCase();
      const contentType = FILE_TYPES[extension];
      if (!contentType) throw new Error('Invalid stored file type');
      response.set({
        'Content-Type': contentType,
        'Content-Length': String(stored.length),
        'Content-Disposition': 'attachment',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      const download = new GridFSBucket(db, { bucketName: 'courseFiles' }).openDownloadStream(material.fileId);
      download.on('error', (error) => {
        console.error('File download failed:', error);
        response.destroy(error);
      });
      response.on('close', () => download.destroy());
      return download.pipe(response);
    } catch (error) {
      console.error('File lookup failed:', error);
      return response.status(500).json({ message: 'Could not retrieve file' });
    }
  });

  app.delete('/api/courses/:id/materials/:materialId', authenticate, async (request, response) => {
    if (!['admin', 'faculty'].includes(request.user.role)) {
      return response.status(403).json({ message: 'Admin or faculty access required' });
    }
    if (!/^[a-f\d]{24}$/i.test(request.params.id) || !/^[a-f\d]{24}$/i.test(request.params.materialId)) {
      return response.status(400).json({ message: 'Invalid course or material ID' });
    }
    const db = request.app.locals.db;
    const courseId = new ObjectId(request.params.id);
    const materialId = new ObjectId(request.params.materialId);
    try {
      const filter = { _id: courseId, 'materials._id': materialId };
      if (request.user.role === 'faculty') filter.facultyId = request.user._id;
      const previous = await db.collection('courses').findOneAndUpdate(
        filter,
        { $pull: { materials: { _id: materialId } } },
        { returnDocument: 'before', projection: { materials: 1 } }
      );
      if (!previous) return response.status(404).json({ message: 'Material not found or not assigned to you' });
      const material = previous.materials.find((item) => item._id.equals(materialId));
      try {
        await db.collection('lessonProgress').deleteMany({ courseId, materialId });
        if (material.type === 'file') {
          if (!(material.fileId instanceof ObjectId)) throw new Error('Invalid stored file ID');
          await new GridFSBucket(db, { bucketName: 'courseFiles' }).delete(material.fileId);
        }
      } catch (error) {
        console.error('Material was removed but cleanup failed:', error);
        return response.status(500).json({ message: 'Material was removed, but cleanup failed. Refresh and contact an administrator' });
      }
      return response.json({ message: 'Material deleted' });
    } catch (error) {
      console.error('Material deletion failed:', error);
      return response.status(500).json({ message: 'Could not delete material. Refresh to check the course' });
    }
  });
};

module.exports.validFileSize = validFileSize;
