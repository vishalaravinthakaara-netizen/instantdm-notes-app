import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, FileText, Trash2, ArrowLeft, Check, X, Pencil, Feather, Clock3, Paperclip, Image as ImageIcon, File as FileIcon, Download } from 'lucide-react';

const API = 'http://localhost:4000/api/notes';
const prettyDate = (value) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
const excerpt = (value) => value?.trim() ? value.trim().replace(/\s+/g, ' ') : 'No additional text';
const fileUrl = (url) => `http://localhost:4000${url}`;
const isImage = (mime) => mime?.startsWith('image/');

export default function App() {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadNotes(term = search) {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API}?search=${encodeURIComponent(term)}`);
      if (!response.ok) throw new Error('Could not load your notes. Is the server running?');
      setNotes(await response.json());
    } catch (err) { setError(err.message || 'Something went wrong.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadNotes(''); }, []);
  useEffect(() => {
    const timer = setTimeout(() => loadNotes(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const isEditing = selected?.id != null;
  const wordCount = useMemo(() => content.length, [content]);
  function openNew() { setSelected({ id: null, attachments: [] }); setTitle(''); setContent(''); setPendingFiles([]); setError(''); setNotice(''); }
  async function openNote(note) {
    setError(''); setNotice(''); setPendingFiles([]);
    try {
      const response = await fetch(`${API}/${note.id}`);
      if (!response.ok) throw new Error('Could not open this note.');
      const fullNote = await response.json();
      setSelected(fullNote); setTitle(fullNote.title); setContent(fullNote.content || '');
    } catch (err) { setError(err.message); }
  }
  function closeEditor() { setSelected(null); setTitle(''); setContent(''); setPendingFiles([]); setError(''); setNotice(''); }
  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if ((selected?.attachments?.length || 0) + pendingFiles.length + files.length > 5) {
      setError('A note can have at most 5 attachments.'); return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    for (const file of files) {
      if (!allowed.includes(file.type)) { setError(`${file.name}: unsupported file type.`); return; }
      if (file.size > 5 * 1024 * 1024) { setError(`${file.name}: file must be 5 MB or smaller.`); return; }
    }
    setError(''); setPendingFiles(old => [...old, ...files]);
  }
  async function removeAttachment(attachment) {
    if (!window.confirm(`Remove ${attachment.originalName}?`)) return;
    try {
      const response = await fetch(`${API}/${selected.id}/attachments/${attachment.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not remove attachment.');
      setSelected(old => ({ ...old, attachments: old.attachments.filter(item => item.id !== attachment.id) }));
    } catch (err) { setError(err.message); }
  }
  async function saveNote(event) {
    event.preventDefault();
    if (!title.trim()) { setError('Give your note a title first.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch(isEditing ? `${API}/${selected.id}` : API, {
        method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not save this note.');
      let savedNote = data;
      if (!isEditing) { setSelected(data); setTitle(data.title); setContent(data.content || ''); }
      if (pendingFiles.length) {
        const form = new FormData();
        pendingFiles.forEach(file => form.append('files', file));
        const uploadResponse = await fetch(`${API}/${data.id}/attachments`, { method: 'POST', body: form });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(`Note saved, but attachments were not uploaded: ${uploadData.error || 'Upload failed'}`);
        savedNote = { ...data, attachments: uploadData };
        setSelected(savedNote); setPendingFiles([]);
      }
      await loadNotes(search); closeEditor();
      setNotice(isEditing ? 'Your note was updated.' : 'A new note has been saved.');
    } catch (err) { setError(err.message || 'Could not save this note.'); }
    finally { setSaving(false); }
  }
  async function removeNote(note) {
    if (!window.confirm(`Delete “${note.title}”? This cannot be undone.`)) return;
    setError('');
    try {
      const response = await fetch(`${API}/${note.id}`, { method: 'DELETE' });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Could not delete this note.'); }
      if (selected?.id === note.id) closeEditor();
      await loadNotes(search); setNotice('Note deleted.');
    } catch (err) { setError(err.message || 'Could not delete this note.'); }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); closeEditor(); }}><span className="brand-mark"><Feather size={19} strokeWidth={1.8}/></span><span>little<span className="brand-light">notes</span></span></a>
        <span className="top-caption">A little space for your thoughts</span><span className="saved-indicator"><span className="saved-dot"/> Saved locally</span>
      </header>
      <section className="content-wrap">
        {selected ? (
          <section className="editor-panel">
            <button className="back-button" onClick={closeEditor}><ArrowLeft size={16}/> All notes</button>
            <form onSubmit={saveNote} className="editor-form">
              <div className="editor-kicker">{isEditing ? 'YOUR NOTE' : 'A NEW THOUGHT'}</div>
              <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Give your note a title..." autoFocus />
              <div className="editor-meta"><span>{isEditing ? `Created ${prettyDate(selected.createdAt)}` : 'Take your time.'}</span><span>{title.length}/100</span></div>
              <div className="editor-divider"/>
              <textarea className="content-input" value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} placeholder="Start writing here..." />
              <section className="attachments-section">
                <div className="attachments-heading"><span><Paperclip size={15}/> ATTACHMENTS</span><small>{(selected.attachments?.length || 0) + pendingFiles.length}/5 files · 5 MB each</small></div>
                {(selected.attachments?.length > 0 || pendingFiles.length > 0) && <div className="attachment-grid">
                  {selected.attachments?.map(file => <article className="attachment-item" key={`saved-${file.id}`}>
                    {isImage(file.mimeType) ? <a href={fileUrl(file.url)} target="_blank" rel="noreferrer" className="attachment-preview"><img src={fileUrl(file.url)} alt={file.originalName}/></a> : <a className="document-preview" href={fileUrl(file.url)} target="_blank" rel="noreferrer"><FileText size={24}/><span>Open document</span></a>}
                    <div className="attachment-info"><span title={file.originalName}>{file.originalName}</span><button type="button" onClick={() => removeAttachment(file)} aria-label={`Remove ${file.originalName}`}><X size={14}/></button></div>
                  </article>)}
                  {pendingFiles.map((file, index) => <article className="attachment-item pending-attachment" key={`pending-${index}`}>
                    <div className="document-preview">{isImage(file.type) ? <ImageIcon size={24}/> : <FileIcon size={24}/>}<span>Ready to upload</span></div>
                    <div className="attachment-info"><span title={file.name}>{file.name}</span><button type="button" onClick={() => setPendingFiles(old => old.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><X size={14}/></button></div>
                  </article>)}
                </div>}
                <label className="upload-zone"><Paperclip size={17}/><span><strong>Add photos or documents</strong><small>JPG, PNG, WEBP, PDF, DOC, DOCX, TXT</small></span><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.txt" onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/></label>
              </section>
              <div className="editor-footer"><span>{wordCount}/2000 characters</span><div className="editor-actions"><button type="button" className="button button-quiet" onClick={closeEditor}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : <><Check size={16}/> Save note</>}</button></div></div>
              {error && <p className="inline-error">{error}</p>}
            </form>
          </section>
        ) : (
          <>
            <div className="page-heading"><div><p className="eyebrow">YOUR PERSONAL SPACE</p><h1>Good thoughts,<br/><em>kept close.</em></h1><p className="intro-copy">A quiet place to collect the things you don't want to forget.</p></div><div className="heading-decoration"><span>✳</span><small>MAKE ROOM<br/>FOR IDEAS</small></div></div>
            <div className="toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your notes..." aria-label="Search notes"/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={15}/></button>}</div><button className="button button-primary new-button" onClick={openNew}><Plus size={17}/> New note</button></div>
            {notice && <div className="notice"><Check size={15}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
            {error && <div className="error-banner">{error}<button onClick={() => loadNotes(search)}>Try again</button></div>}
            <div className="list-heading"><span>{search ? 'SEARCH RESULTS' : 'ALL NOTES'}</span><span>{loading ? '…' : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}</span></div>
            {loading ? <div className="state-card"><div className="loader"/><p>Gathering your thoughts…</p></div> : notes.length === 0 ? <div className="empty-state"><div className="empty-icon"><FileText size={25}/></div><h2>{search ? 'No notes found' : 'No notes yet'}</h2><p>{search ? 'Try another word or clear your search.' : 'Every good idea starts somewhere. Save your first thought.'}</p>{!search && <button className="button button-primary" onClick={openNew}><Plus size={16}/> Write your first note</button>}</div> : <div className="notes-grid">{notes.map((note, index) => <article className={`note-card tone-${index % 4}`} key={note.id} onClick={() => openNote(note)} tabIndex="0" onKeyDown={(e) => e.key === 'Enter' && openNote(note)}><div className="card-top"><span className="card-date"><Clock3 size={12}/>{prettyDate(note.updatedAt)}</span><button className="icon-button delete-button" title="Delete note" aria-label={`Delete ${note.title}`} onClick={(e) => { e.stopPropagation(); removeNote(note); }}><Trash2 size={15}/></button></div><h2>{note.title}</h2><p>{excerpt(note.content)}</p><div className="card-bottom"><span>{note.attachments?.length ? <><Paperclip size={12}/> {note.attachments.length} ATTACHMENTS</> : 'OPEN NOTE'} <ArrowLeft size={12}/></span><Pencil size={14}/></div></article>)}</div>}
          </>
        )}
      </section>
      <footer className="footer"><span>Made for the thoughts worth keeping.</span><span>little notes <span className="footer-star">✳</span></span></footer>
    </main>
  );
}
