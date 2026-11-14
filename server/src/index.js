import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;
const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(here, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(uploadsDir, { fallthrough: false, dotfiles: 'deny', index: false }));

const allowedTypes = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'],
  ['application/pdf', '.pdf'], ['text/plain', '.txt'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx']
]);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${allowedTypes.get(file.mimetype) || '.bin'}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.has(file.mimetype)) return cb(new Error('Unsupported file type. Use JPG, PNG, WEBP, PDF, DOC, DOCX or TXT.'));
    cb(null, true);
  }
});

const noteColumns = 'id, title, content, createdAt, updatedAt';
const getNote = db.prepare(`SELECT ${noteColumns} FROM notes WHERE id = ?`);
const getAttachments = db.prepare('SELECT id, noteId, originalName, storedName, mimeType, size, createdAt FROM attachments WHERE noteId = ? ORDER BY id ASC');
function withAttachments(note) {
  if (!note) return null;
  const attachments = getAttachments.all(note.id).map(({ storedName, ...item }) => ({ ...item, url: `/uploads/${storedName}` }));
  return { ...note, attachments };
}
const listNotes = db.prepare(`SELECT ${noteColumns} FROM notes ORDER BY updatedAt DESC, id DESC`);
const insertNote = db.prepare('INSERT INTO notes (title, content, createdAt, updatedAt) VALUES (@title, @content, @createdAt, @updatedAt)');
const updateNote = db.prepare('UPDATE notes SET title = @title, content = @content, updatedAt = @updatedAt WHERE id = @id');
const deleteNote = db.prepare('DELETE FROM notes WHERE id = ?');

function validateNote(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const content = body?.content == null ? '' : body.content;
  if (!title) return { error: 'title is required' };
  if (title.length > 100) return { error: 'title must be 100 characters or fewer' };
  if (typeof content !== 'string') return { error: 'content must be text' };
  if (content.length > 2000) return { error: 'content must be 2000 characters or fewer' };
  return { value: { title, content } };
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/notes', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const notes = search
    ? db.prepare(`SELECT ${noteColumns} FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updatedAt DESC, id DESC`).all(`%${search}%`, `%${search}%`)
    : listNotes.all();
  res.json(notes.map(withAttachments));
});
app.get('/api/notes/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid note id' });
  const note = withAttachments(getNote.get(id));
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});
app.post('/api/notes', (req, res) => {
  const checked = validateNote(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const now = new Date().toISOString();
  const result = insertNote.run({ ...checked.value, createdAt: now, updatedAt: now });
  res.status(201).json(withAttachments(getNote.get(result.lastInsertRowid)));
});
app.put('/api/notes/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid note id' });
  if (!getNote.get(id)) return res.status(404).json({ error: 'Note not found' });
  const checked = validateNote(req.body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  updateNote.run({ ...checked.value, updatedAt: new Date().toISOString(), id });
  res.json(withAttachments(getNote.get(id)));
});
app.delete('/api/notes/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid note id' });
  const files = db.prepare('SELECT storedName FROM attachments WHERE noteId = ?').all(id);
  const result = deleteNote.run(id);
  if (!result.changes) return res.status(404).json({ error: 'Note not found' });
  for (const file of files) fs.rmSync(path.join(uploadsDir, file.storedName), { force: true });
  res.status(204).end();
});

app.post('/api/notes/:id/attachments', (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid note id' });
  if (!getNote.get(id)) return res.status(404).json({ error: 'Note not found' });
  const current = db.prepare('SELECT COUNT(*) AS count FROM attachments WHERE noteId = ?').get(id).count;
  upload.array('files', 5)(req, res, (err) => {
    if (err) return next(err);
    const files = req.files || [];
    if (current + files.length > 5) {
      files.forEach(file => fs.rmSync(file.path, { force: true }));
      return res.status(400).json({ error: 'A note can have at most 5 attachments.' });
    }
    const insert = db.prepare('INSERT INTO attachments (noteId, originalName, storedName, mimeType, size, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
    const transaction = db.transaction(items => items.forEach(file => insert.run(id, path.basename(file.originalname), file.filename, file.mimetype, file.size, new Date().toISOString())));
    try {
      transaction(files);
      res.status(201).json(withAttachments(getNote.get(id)).attachments);
    } catch (e) {
      files.forEach(file => fs.rmSync(file.path, { force: true }));
      next(e);
    }
  });
});

app.delete('/api/notes/:id/attachments/:attachmentId', (req, res) => {
  const noteId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(noteId) || noteId < 1 || !Number.isInteger(attachmentId) || attachmentId < 1) return res.status(400).json({ error: 'Invalid note or attachment id' });
  const attachment = db.prepare('SELECT storedName FROM attachments WHERE id = ? AND noteId = ?').get(attachmentId, noteId);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachmentId);
  fs.rmSync(path.join(uploadsDir, attachment.storedName), { force: true });
  res.status(204).end();
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 5 MB or smaller.' : err.code === 'LIMIT_FILE_COUNT' ? 'You can upload at most 5 files at a time.' : err.message;
    return res.status(400).json({ error: message });
  }
  if (err.message?.startsWith('Unsupported file type')) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Something went wrong on the server' });
});

app.listen(PORT, '127.0.0.1', () => console.log(`Notes API running at http://localhost:${PORT}`));
