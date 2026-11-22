const express = require('express');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { ObjectId, GridFSBucket } = require('mongodb');

const CHUNK_SIZE = 1024 * 1024;
const MAX_FILE_BYTES = 50 * CHUNK_SIZE;
const TYPES = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.mp4', '.webm']);
const validId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

module.exports = function registerChunkedFiles(app, authenticate, getCourseAccess) {
  async function checkAccess(request, response, next) {
    if (!validId(request.params.id)) return response.status(400).json({ message: 'Invalid course ID' });
    try {
      request.courseId = new ObjectId(request.params.id);
      const access = await getCourseAccess(request.app.locals.db, request.user, request.courseId);
      if (!access.course) return response.status(access.status).json({ message: access.message });
      request.course = access.course;
      return next();
    } catch (error) {
      console.error('File access check failed:', error);
      return response.status(500).json({ message: 'Could not check course access' });
    }
  }

  function requireManager(request, response, next) {
    if (!['admin', 'faculty'].includes(request.user.role)) {
      return response.status(403).json({ message: 'Admin or faculty access required' });
    }
    return next();
  }

  app.post('/api/courses/:id/file-uploads', authenticate, requireManager, checkAccess, async (request, response) => {
    const { title, filename, size } = request.body || {};
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 100 ||
      typeof filename !== 'string' || !filename || filename.length > 200 ||
      filename !== path.basename(filename) || filename.includes('\\') ||
      !TYPES.has(path.extname(filename).toLowerCase()) ||
      !Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) {
      return response.status(400).json({ message: 'Invalid file details' });
    }
    if (request.course.materials !== undefined && !Array.isArray(request.course.materials)) {
      return response.status(500).json({ message: 'Invalid course materials data' });
    }
    if (request.course.materials?.length >= 5) {
      return response.status(409).json({ message: 'Course already has five materials' });
    }
    try {
      const session = {
        courseId: request.courseId, ownerId: request.user._id, title: title.trim(), filename, size,
        status: 'uploading', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      const result = await request.app.locals.db.collection('fileUploadSessions').insertOne(session);
      return response.status(201).json({ uploadId: result.insertedId, chunkSize: CHUNK_SIZE });
    } catch (error) {
      console.error('File upload initialization failed:', error);
      return response.status(500).json({ message: 'Could not start upload' });
    }
  });

  app.put('/api/courses/:id/file-uploads/:uploadId/chunks/:index',
    authenticate, requireManager, checkAccess,
    express.raw({ type: 'application/octet-stream', limit: CHUNK_SIZE }),
    async (request, response) => {
      const { uploadId, index } = request.params;
      if (!validId(uploadId) || !/^(0|[1-9]\d*)$/.test(index) || !Buffer.isBuffer(request.body)) {
        return response.status(400).json({ message: 'Invalid upload chunk' });
      }
      try {
        const db = request.app.locals.db;
        const session = await db.collection('fileUploadSessions').findOne({
          _id: new ObjectId(uploadId), ownerId: request.user._id, courseId: request.courseId,
          status: 'uploading', expiresAt: { $gt: new Date() },
        });
        if (!session) return response.status(404).json({ message: 'Upload session unavailable' });
        const number = Number(index);
        const expected = Math.min(CHUNK_SIZE, session.size - number * CHUNK_SIZE);
        if (!Number.isSafeInteger(number) || expected <= 0 || request.body.length !== expected) {
          return response.status(400).json({ message: 'Invalid chunk size or position' });
        }
        await db.collection('fileUploadChunks').replaceOne(
          { uploadId: session._id, index: number },
          { uploadId: session._id, index: number, data: request.body, expiresAt: session.expiresAt },
          { upsert: true }
        );
        return response.json({ index: number });
      } catch (error) {
        console.error('File chunk upload failed:', error);
        return response.status(500).json({ message: 'Could not upload file chunk' });
      }
    });

  app.post('/api/courses/:id/file-uploads/:uploadId/complete', authenticate, requireManager, checkAccess, async (request, response) => {
    if (!validId(request.params.uploadId)) return response.status(400).json({ message: 'Invalid upload ID' });
    const db = request.app.locals.db;
    const uploadId = new ObjectId(request.params.uploadId);
    const bucket = new GridFSBucket(db, { bucketName: 'courseFiles' });
    let fileId;
    let stored = false;
    try {
      const session = await db.collection('fileUploadSessions').findOneAndUpdate(
        { _id: uploadId, ownerId: request.user._id, courseId: request.courseId,
          status: 'uploading', expiresAt: { $gt: new Date() } },
        { $set: { status: 'completing' } },
        { returnDocument: 'after' }
      );
      if (!session) return response.status(404).json({ message: 'Upload session unavailable' });
      const chunks = await db.collection('fileUploadChunks')
        .find({ uploadId }, { projection: { index: 1, data: 1 } }).sort({ index: 1 }).toArray();
      const count = Math.ceil(session.size / CHUNK_SIZE);
      if (chunks.length !== count || chunks.some((chunk, index) =>
        chunk.index !== index || chunk.data.buffer.length !== Math.min(CHUNK_SIZE, session.size - index * CHUNK_SIZE)
      )) {
        await db.collection('fileUploadSessions').updateOne({ _id: uploadId, status: 'completing' }, { $set: { status: 'uploading' } });
        return response.status(400).json({ message: 'Upload is incomplete; please retry' });
      }
      const upload = bucket.openUploadStream(session.filename);
      fileId = upload.id;
      try {
        await pipeline(Readable.from(chunks.map((chunk) => chunk.data.buffer)), upload);
      } catch (error) {
        try { await upload.abort(); } catch (cleanupError) { console.error('Incomplete GridFS cleanup failed:', cleanupError); }
        throw error;
      }
      stored = true;
      const material = {
        _id: new ObjectId(), title: session.title, type: 'file', content: session.filename,
        fileId, createdAt: new Date(), createdBy: request.user._id,
      };
      const filter = {
        _id: request.courseId,
        $expr: { $lt: [{ $size: { $ifNull: ['$materials', []] } }, 5] },
      };
      if (request.user.role === 'faculty') filter.facultyId = request.user._id;
      const updated = await db.collection('courses').findOneAndUpdate(
        filter, { $push: { materials: material } }, { returnDocument: 'after', projection: { _id: 1 } }
      );
      if (!updated) {
        await bucket.delete(fileId);
        stored = false;
        await db.collection('fileUploadSessions').deleteOne({ _id: uploadId });
        await db.collection('fileUploadChunks').deleteMany({ uploadId });
        return response.status(409).json({ message: 'Course access or material limit changed' });
      }
      await db.collection('fileUploadSessions').deleteOne({ _id: uploadId });
      await db.collection('fileUploadChunks').deleteMany({ uploadId });
      return response.status(201).json(material);
    } catch (error) {
      if (stored) {
        try {
          const linked = await db.collection('courses').findOne({ _id: request.courseId, 'materials.fileId': fileId });
          if (!linked) await bucket.delete(fileId);
        } catch (cleanupError) {
          console.error('Could not verify or clean up uploaded file:', cleanupError);
        }
      }
      console.error('File upload completion failed:', error);
      return response.status(500).json({ message: 'Could not finish upload. Refresh to check the course' });
    }
  });

  app.get('/api/courses/:id/materials/:materialId/file-chunks/:index', authenticate, checkAccess, async (request, response) => {
    const { materialId, index } = request.params;
    if (!validId(materialId) || !/^(0|[1-9]\d*)$/.test(index)) {
      return response.status(400).json({ message: 'Invalid file chunk' });
    }
    try {
      const material = request.course.materials?.find((item) =>
        item._id instanceof ObjectId && item._id.equals(new ObjectId(materialId)) &&
        item.type === 'file' && item.fileId instanceof ObjectId
      );
      if (!material) return response.status(404).json({ message: 'File not found' });
      const db = request.app.locals.db;
      const stored = await db.collection('courseFiles.files').findOne({ _id: material.fileId });
      if (!stored) return response.status(404).json({ message: 'Stored file not found' });
      const number = Number(index);
      const start = number * CHUNK_SIZE;
      if (!Number.isSafeInteger(number) || start >= stored.length) {
        return response.status(416).json({ message: 'Invalid chunk position' });
      }
      const end = Math.min(start + CHUNK_SIZE, stored.length);
      response.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(end - start),
        'X-File-Size': String(stored.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      });
      const download = new GridFSBucket(db, { bucketName: 'courseFiles' })
        .openDownloadStream(material.fileId, { start, end });
      download.on('error', (error) => {
        console.error('File chunk download failed:', error);
        response.destroy(error);
      });
      response.on('close', () => download.destroy());
      return download.pipe(response);
    } catch (error) {
      console.error('File chunk lookup failed:', error);
      return response.status(500).json({ message: 'Could not retrieve file' });
    }
  });
};
