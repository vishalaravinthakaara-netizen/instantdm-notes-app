# Little Notes

A small full-stack notes app built with React, Express and SQLite. Notes support text plus multiple photo/document attachments.

## Features
- Create, read, update and delete notes
- Search by title or content
- Title validation (required, maximum 100 characters)
- Content validation (optional, maximum 2,000 characters)
- Newest/most recently updated notes first
- Loading, empty and error states
- SQLite persistence across server restarts
- Up to 5 attachments per note, maximum 5 MB each
- Supported attachments: JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX and TXT
- Attachment metadata is stored in SQLite; actual files are stored in `server/uploads/`
- Deleting a note also deletes its attachments

## Requirements
- Node.js 20 or newer (includes npm)

## Install
From the project root:

```bash
npm install
npm install --prefix server
npm install --prefix client
```

## Run in development
From the project root:

```bash
npm run dev
```

The React app runs at http://localhost:5173 and the API runs at http://localhost:4000.

Alternatively, run the backend and frontend in separate terminals:

```bash
npm run dev --prefix server
```

```bash
npm run dev --prefix client
```

## REST API
- `GET /api/notes` — list notes; optional `?search=text`
- `GET /api/notes/:id` — get one note, including attachments
- `POST /api/notes` — create a note with `{ "title": "...", "content": "..." }`
- `PUT /api/notes/:id` — update a note
- `DELETE /api/notes/:id` — delete a note and its stored attachments
- `POST /api/notes/:id/attachments` — upload multipart files using the `files` field
- `DELETE /api/notes/:id/attachments/:attachmentId` — remove one attachment
- `GET /uploads/:storedName` — retrieve an uploaded file
- `GET /api/health` — health check

Successful create returns `201`, successful delete returns `204`, invalid input returns `400`, missing notes return `404`.

## Database and file storage
SQLite is created automatically at `server/data/notes.sqlite` the first time the API starts. The database stores note content and attachment metadata. Uploaded file bytes are stored in `server/uploads/`. Both folders are intentionally ignored by Git because they contain runtime user data. Keep both folders when backing up or moving a local installation if you want to retain notes and attachments.

## Assumptions and limitations
- This is a single-user local notes app; authentication and user accounts are outside the task scope.
- Each note can have up to 5 attachments; each file is limited to 5 MB.
- Only JPG/JPEG, PNG, WEBP, PDF, DOC, DOCX and TXT are accepted based on the uploaded file's declared MIME type. This is a small local demo, not a hardened public upload service.
- Files are served by the local Express server. This is not cloud storage or encrypted document vault functionality.
- Search covers note title and text content, not attachment contents.
- `updatedAt` changes whenever note text is edited.

## What I'd improve with more time
- Add automated API and UI tests.
- Add stronger file-content signature validation, malware scanning and safer private file access.
- Add backups and configurable storage for deployment.
- Add pagination if the notes collection becomes large.
- Add accessible keyboard shortcuts and richer editor support.
- Add authentication and per-user data isolation if the app becomes multi-user.
