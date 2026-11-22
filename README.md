# EdTech ELearn

A React, Express, and MongoDB learning management application.

## Local setup

1. Start MongoDB and configure `backend/.env` with `MONGO_URI`, `JWT_SECRET`, and optionally `PORT` (default 5000). Use a long, unique secret. Never commit the environment file.
2. In `backend`, run `npm install` and then `npm run dev`.
3. In `frontend`, run `npm install` and then `npm run dev`. Open the URL displayed by Vite.

The frontend's `/api` proxy is for local development. This project is not yet configured or verified for production deployment. Admin creation requires a separate, controlled provisioning process; public registration creates only students or pending faculty.

## Features

- Admins can manage courses, approve faculty and enrollment requests, assign faculty, and view faculty and learner account details.
- Assigned faculty can edit their courses and manage their materials. Approved learners are enrolled.
- Each course can contain up to five materials in total: text, external links, or uploaded files. Files are stored in MongoDB GridFS. Supported extensions are PDF, DOC, DOCX, PPT, PPTX, MP4, and WebM, with a maximum size of 50 MiB (52,428,800 bytes). File titles can be edited; a file can be replaced by deleting its material and uploading a new one. Deleting a material also removes learners' completion records for it.
- Course materials, files, feedback, and discussion are accessible to admins, assigned faculty, and enrolled learners. Only enrolled learners can mark lessons complete or submit one editable rating and comment per course.
- Course discussions show the latest 100 messages and refresh approximately every five seconds. They do not currently provide moderation or message deletion.
- Signed-in users can change their display name or password. Changing a password invalidates existing sessions and issues a new token to the current session.

External links point to independent websites; access restrictions in this app cannot protect those websites. Upload extension checks do not scan files for malware. For production, add malware scanning, rate limiting, backup and recovery, resource quotas, monitoring, and suitable moderation and retention policies.

## Validation

Run `npm test` in `backend` for integration tests against an isolated, automatically removed test database on the MongoDB server specified in `backend/.env`. The tests do not alter the application database, but do require permission to create and drop their own test database.

Run `npm run lint` and `npm run build` in `frontend`. The upload boundary validator is tested at 50 MiB and one byte above it; a full-size end-to-end upload has not yet been verified on this machine because of available system resources.

The existing one-hour JWT sessions are kept in browser memory and are cleared on refresh. Forgotten-password recovery, deployment configuration, and a remote Git repository remain to be set up.
