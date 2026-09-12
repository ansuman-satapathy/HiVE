import { useState, useEffect, useRef, useCallback } from 'react'
import {
  UploadCloud,
  FileText,
  Trash2,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  ExternalLink,
  ChevronRight,
  Database,
  Hash,
  FileCode
} from 'lucide-react'
import { tokenStorage } from '../utils/storage'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function DocumentHub() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [docChunks, setDocChunks] = useState([])
  const [loadingChunks, setLoadingChunks] = useState(false)
  const fileInputRef = useRef(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const token = tokenStorage.getToken()
      const res = await fetch('/api/documents', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const hasActiveDocs = documents.some((d) => ['pending', 'parsing', 'chunking', 'indexing'].includes(d.status))

  useEffect(() => {
    let timeoutId
    let isMounted = true

    const runPoll = async () => {
      await fetchDocuments()
      if (!isMounted) return
      const interval = hasActiveDocs ? 2500 : 20000
      timeoutId = setTimeout(runPoll, interval)
    }

    runPoll()
    return () => {
      isMounted = false
      clearTimeout(timeoutId)
    }
  }, [fetchDocuments, hasActiveDocs])

  const handleFileUpload = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'md', 'txt'].includes(ext)) {
      setError(`Unsupported file type .${ext}. Only PDF, Markdown (.md), and TXT are supported.`)
      return
    }

    setUploading(true)
    setError(null)
    setUploadSuccess(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const token = tokenStorage.getToken()
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Upload failed')
      }

      setUploadSuccess(data.message)
      await fetchDocuments()
    } catch (err) {
      setError(err.message || 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this document and all its indexed chunks?')) return
    try {
      const token = tokenStorage.getToken()
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId))
        if (selectedDoc?.id === docId) {
          setSelectedDoc(null)
          setDocChunks([])
        }
      }
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }

  const handleInspectChunks = async (doc) => {
    setSelectedDoc(doc)
    setLoadingChunks(true)
    try {
      const token = tokenStorage.getToken()
      const res = await fetch(`/api/documents/${doc.id}/chunks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const chunks = await res.json()
        setDocChunks(chunks)
      }
    } catch (err) {
      console.error('Failed to fetch chunks:', err)
    } finally {
      setLoadingChunks(false)
    }
  }

  const filteredDocs = documents.filter((d) =>
    d.filename.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={{ maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '36px 32px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--primary-subtle)', border: '1px solid var(--primary-border)', color: 'var(--primary)', fontSize: '11px', fontWeight: 600, marginBottom: '12px' }}>
            <Sparkles size={13} />
            <span>INGESTION & CORPUS STORE</span>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
            Document Hub
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, maxWidth: '640px' }}>
            Upload raw unstructured files into structured semantic chunks with breadcrumb metadata for dense retrieval & agent tool execution.
          </p>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-primary"
          disabled={uploading}
          style={{ gap: '8px', padding: '10px 18px', borderRadius: 'var(--radius-md)' }}
        >
          {uploading ? <Loader2 size={16} className="spin-animate" /> : <UploadCloud size={16} />}
          <span>{uploading ? 'Ingesting...' : 'Upload Document'}</span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".pdf,.md,.txt"
          onChange={(e) => {
            if (e.target.files?.[0]) handleFileUpload(e.target.files[0])
          }}
        />
      </div>

      {/* Upload Feedback Messages */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--error-bg)',
          border: '1px solid var(--error-border)',
          color: 'var(--error)',
          fontSize: '13px',
          marginBottom: '24px',
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {uploadSuccess && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--success-bg)',
          border: '1px solid var(--success-border)',
          color: 'var(--success)',
          fontSize: '13px',
          marginBottom: '24px',
        }}>
          <CheckCircle2 size={16} />
          <span>{uploadSuccess}</span>
        </div>
      )}

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0])
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border-default)'}`,
          backgroundColor: dragOver ? 'var(--primary-subtle)' : 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: '36px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '36px',
          transition: 'all 0.2s ease',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary-subtle)',
          color: 'var(--primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '14px',
        }}>
          <UploadCloud size={24} />
        </div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
          Drop PDF, Markdown, or TXT file here or click to browse
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          Files are automatically parsed, section-split, and indexed asynchronously. Max 50MB.
        </p>
      </div>

      {/* Search & Corpus Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedDoc ? '1fr 1fr' : '1fr', gap: '28px', alignItems: 'start' }}>
        {/* Left Column: Documents List */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={17} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Corpus Documents ({documents.length})
              </h2>
            </div>
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter files..."
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 30px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-surface)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="spin-animate" style={{ margin: '0 auto 12px auto' }} />
              <p style={{ fontSize: '13px', margin: 0 }}>Loading document workspace...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <FileText size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
              <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                No documents found
              </p>
              <p style={{ fontSize: '12px', margin: 0 }}>
                {searchQuery ? 'Try matching another filename' : 'Upload your first document above to begin chunking.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredDocs.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id
                return (
                  <div
                    key={doc.id}
                    onClick={() => handleInspectChunks(doc)}
                    className="card"
                    style={{
                      padding: '16px 20px',
                      cursor: 'pointer',
                      border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border-default)',
                      backgroundColor: isSelected ? 'var(--primary-subtle)' : 'var(--bg-surface)',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-subtle)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                        flexShrink: 0,
                      }}>
                        <FileText size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          margin: '0 0 4px 0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {doc.filename}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          <span>{formatBytes(doc.file_size_bytes)}</span>
                          <span>•</span>
                          <span style={{ textTransform: 'uppercase' }}>{doc.file_type}</span>
                          <span>•</span>
                          <span>{doc.chunk_count} chunks</span>
                          <span>•</span>
                          <span>{doc.token_count.toLocaleString()} tokens</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`badge ${
                        doc.status === 'ready' ? 'badge-success' :
                        doc.status === 'failed' ? 'badge-danger' : 'badge-primary'
                      }`}>
                        {doc.status}
                      </span>
                      <button
                        onClick={(e) => handleDelete(doc.id, e)}
                        className="btn btn-ghost btn-sm"
                        title="Delete document"
                        style={{ padding: '6px', color: 'var(--text-muted)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Column: Chunk Inspector Drawer */}
        {selectedDoc && (
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '620px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Layers size={15} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Chunk Inspector
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedDoc.filename}
                </h3>
              </div>
              <button
                onClick={() => { setSelectedDoc(null); setDocChunks([]) }}
                className="btn btn-ghost btn-sm"
                style={{ padding: '4px' }}
              >
                Close
              </button>
            </div>

            {/* Chunks scroll view */}
            <div style={{ flex: 1, overflowY: 'auto', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loadingChunks ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Loader2 size={20} className="spin-animate" style={{ margin: '0 auto 8px auto' }} />
                  <p style={{ fontSize: '12px', margin: 0 }}>Loading chunks...</p>
                </div>
              ) : docChunks.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  {selectedDoc.status === 'ready' ? 'No chunks extracted.' : 'Document is currently being processed by worker.'}
                </div>
              ) : (
                docChunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    style={{
                      padding: '14px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-subtle)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="badge badge-mono" style={{ fontSize: '10px' }}>
                        Chunk #{chunk.chunk_index} • {chunk.token_count} tokens
                      </span>
                      {chunk.chunk_metadata?.active_heading && (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)' }}>
                          § {chunk.chunk_metadata.active_heading}
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      lineHeight: 1.5,
                      color: 'var(--text-secondary)',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      maxHeight: '140px',
                      overflowY: 'auto',
                    }}>
                      {chunk.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
