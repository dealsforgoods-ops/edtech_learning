# EdTech ELearn

A React, Express, and MongoDB learning management application.

## Project links

- Application: [EdTech ELearn](https://edtech-learning-j7c9.netlify.app/) (currently requires Netlify team access; public access has not yet been verified).
- Source code: [GitHub repository](https://github.com/dealsforgoods-ops/edtech_learning).

For assessment, the owner must make the application accessible to the reviewer and provide any required demonstration account credentials through a separate secure channel. Never publish credentials in this README or repository.

## Technology

- React and Vite with Bootstrap for the frontend.
- Node.js and Express, deployed using a Netlify Function, for the API.
- MongoDB Atlas and the official MongoDB Node.js driver for application data; GridFS stores uploaded files. The project does not use Mongoose.
- JWT authentication and bcrypt password hashing.

## Local setup

1. Start MongoDB and configure `backend/.env` with `MONGO_URI`, `JWT_SECRET`, and optionally `PORT` (default 5000). Use a long, unique secret. Never commit the environment file.
2. In `backend`, run `npm install` and then `npm run dev`.
3. In `frontend`, run `npm install` and then `npm run dev`. Open the URL displayed by Vite.

The frontend's `/api` proxy is for local development. The deployed backend uses a Netlify Function and a separate Atlas database.

## First administrator

Public registration only creates active student accounts or faculty accounts pending approval; it cannot create administrators. For this capstone prototype, the project owner must provision the first admin directly in the appropriate database:

1. Register a dedicated account, then locate that exact account in the `users` collection using MongoDB Compass or another authorized database tool.
2. Set its `role` to `admin` and its `status` to `active`. Do not modify the password hash or other users.
3. Sign in with that account and verify the admin navigation. Restrict database access to trusted administrators.

This manual bootstrap is not a production-ready account management process. Use a secure, auditable provisioning workflow and MFA for a production deployment. Never commit or include account passwords, password hashes, JWT secrets or database connection strings in the submission.

## Netlify deployment

The root `netlify.toml` installs both applications, builds the frontend, and routes `/api/*` to an Express-backed Netlify Function. Use the repository root as the Netlify base directory. Configure `MONGO_URI` and `JWT_SECRET` as secret environment variables available to functions; do not put them in the frontend or Git. Atlas needs a network access configuration that permits the deployed functions and a least-privilege database user. The deployed Atlas database is separate from local MongoDB unless data is migrated.

File uploads and downloads use 1 MiB chunks to fit within Netlify's function payload limits. Uploads are staged temporarily in MongoDB with a 24-hour expiry and assembled into GridFS before the material is published. This temporarily uses additional database space. A failed transfer must be started again; a failure during final assembly can leave an orphaned GridFS file requiring administrative cleanup. Full-size transfers were tested against a local test database, not on Netlify; Netlify execution limits, Atlas storage limits, and network conditions can still affect deployed transfers. Test on a private deployment before relying on it.

The deployed app has successfully registered a student against Atlas, but the complete cloud workflow and file transfer still need end-to-end testing. Before public use, provide secure admin provisioning, production access controls for Atlas, rate limiting, storage quotas, malware scanning, moderation, monitoring, and backups. The current app is a capstone prototype, not production-hardened.

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

Run `npm test`, `npm run lint` and `npm run build` in `frontend`. Backend tests exercise a full 50 MiB chunked transfer against an isolated local database, access restrictions, binary handling through a simulated Netlify Function request, and the 50 MiB size boundary. They do not prove that the deployed service supports the same transfer under cloud limits.

The existing one-hour JWT sessions are kept in browser memory and are cleared on refresh. Forgotten-password recovery is not implemented. The current Atlas access configuration used for testing allows connection attempts from anywhere and should be restricted before production use.
