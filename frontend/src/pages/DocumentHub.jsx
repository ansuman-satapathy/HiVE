import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  UploadCloud,
  FileText,
  Trash2,
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Database,
  Hash,
  FileCode,
  Clock,
  Check,
  X,
  FileSpreadsheet,
  Copy,
  Code2,
  Maximize2,
  Minimize2,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { tokenStorage } from '../utils/storage'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function getFileIcon(type) {
  switch (type?.toLowerCase()) {
    case 'pdf':
      return <FileText size={18} />
    case 'md':
      return <FileCode size={18} />
    case 'csv':
    case 'xlsx':
      return <FileSpreadsheet size={18} />
    default:
      return <FileText size={18} />
  }
}

function getProgressPercent(status) {
  switch (status) {
    case 'pending': return 20
    case 'parsing': return 50
    case 'chunking': return 80
    case 'indexing': return 92
    case 'ready': return 100
    case 'failed': return 100
    default: return 10
  }
}

export default function DocumentHub() {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [docChunks, setDocChunks] = useState([])
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [chunkSearch, setChunkSearch] = useState('')
  const [chunkPage, setChunkPage] = useState(1)
  const [copiedChunkId, setCopiedChunkId] = useState(null)
  const fileInputRef = useRef(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const token = tokenStorage.getToken()
      const res = await fetch('/api/documents', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDocuments((prevDocs) => {
          const serverMap = new Map(data.map(d => [d.id, d]))
          const merged = data.slice()
          for (const doc of prevDocs) {
            if (doc.isOptimistic && !serverMap.has(doc.id)) {
              merged.unshift(doc)
            }
          }
          return merged
        })
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const hasActiveDocs = documents.some((d) =>
    ['pending', 'parsing', 'chunking', 'indexing'].includes(d.status)
  )

  useEffect(() => {
    let timeoutId
    let isMounted = true

    const runPoll = async () => {
      await fetchDocuments()
      if (!isMounted) return
      const interval = hasActiveDocs ? 1500 : 15000
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

    const tempId = `opt-${Date.now()}`
    const optimisticDoc = {
      id: tempId,
      filename: file.name,
      file_type: ext,
      file_size_bytes: file.size,
      status: 'pending',
      chunk_count: 0,
      token_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isOptimistic: true,
    }

    setDocuments((prev) => [optimisticDoc, ...prev.filter(d => d.id !== tempId)])

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
      
      if (data.document) {
        setDocuments((prev) => [
          data.document,
          ...prev.filter(d => d.id !== tempId && d.id !== data.document.id)
        ])
      }
      
      await fetchDocuments()
    } catch (err) {
      setError(err.message || 'Failed to upload document')
      setDocuments((prev) => prev.filter(d => d.id !== tempId))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this document and all its indexed sections?')) return
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
    setChunkSearch('')
    setChunkPage(1)
    setLoadingChunks(true)
    try {
      const token = tokenStorage.getToken()
      const res = await fetch(`/api/documents/${doc.id}/chunks?limit=500`, {
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

  const copyChunkToClipboard = (chunkId, text, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedChunkId(chunkId)
    setTimeout(() => setCopiedChunkId(null), 1800)
  }

  // Metrics
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0)
  const totalTokens = documents.reduce((acc, d) => acc + (d.token_count || 0), 0)
  const activeProcessingCount = documents.filter((d) =>
    ['pending', 'parsing', 'chunking', 'indexing'].includes(d.status)
  ).length

  // Filters
  const filteredDocs = documents.filter((d) => {
    const matchesSearch = d.filename.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === 'all' || d.file_type?.toLowerCase() === filterType
    return matchesSearch && matchesType
  })

  // Filtered Chunks & Pagination
  const filteredChunks = useMemo(() => {
    if (!chunkSearch) return docChunks
    const q = chunkSearch.toLowerCase()
    return docChunks.filter(c =>
      c.content?.toLowerCase().includes(q) ||
      c.chunk_metadata?.active_heading?.toLowerCase().includes(q)
    )
  }, [docChunks, chunkSearch])

  const CHUNKS_PER_PAGE = 10
  const totalChunkPages = Math.max(1, Math.ceil(filteredChunks.length / CHUNKS_PER_PAGE))
  const safeChunkPage = Math.min(chunkPage, totalChunkPages)
  const paginatedChunks = useMemo(() => {
    const startIndex = (safeChunkPage - 1) * CHUNKS_PER_PAGE
    return filteredChunks.slice(startIndex, startIndex + CHUNKS_PER_PAGE)
  }, [filteredChunks, safeChunkPage])

  return (
    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '24px 32px' }}>
      {/* Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--border-default)'
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
            Knowledge Base
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Upload manuals, docs, and guides for agent assistance.
          </p>
        </div>

        {/* Clean Stats Counters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="stat-chip">
            <Database size={14} style={{ color: 'var(--primary)' }} />
            <span>Files:</span>
            <strong>{documents.length}</strong>
          </div>

          <div className="stat-chip">
            <Layers size={14} style={{ color: '#0ea5e9' }} />
            <span>Sections:</span>
            <strong>{totalChunks.toLocaleString()}</strong>
          </div>

          <div className="stat-chip">
            <Hash size={14} style={{ color: '#8b5cf6' }} />
            <span>Words/Tokens:</span>
            <strong>{totalTokens.toLocaleString()}</strong>
          </div>

          {activeProcessingCount > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--primary-subtle)',
              border: '1px solid var(--primary-border)',
              borderRadius: 'var(--radius-full)',
              padding: '4px 12px',
              color: 'var(--primary)',
              fontSize: '11px',
              fontWeight: 600,
            }}>
              <Loader2 size={12} className="spin-animate" />
              <span>{activeProcessingCount} Processing</span>
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--error-bg)',
          border: '1px solid var(--error-border)',
          color: 'var(--error)',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={15} />
          </button>
        </div>
      )}

      {uploadSuccess && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--success-bg)',
          border: '1px solid var(--success-border)',
          color: 'var(--success)',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{uploadSuccess}</span>
          </div>
          <button onClick={() => setUploadSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Action Strip: Compact Dropzone & Search / Filter Toolbar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 360px) 1fr',
        gap: '16px',
        alignItems: 'stretch',
        marginBottom: '20px'
      }}>
        {/* Upload Zone */}
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
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border-strong)'}`,
            backgroundColor: dragOver ? 'var(--primary-subtle)' : 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            transition: 'all 0.15s ease',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--primary-subtle)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {uploading ? <Loader2 size={18} className="spin-animate" /> : <UploadCloud size={18} />}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {uploading ? 'Processing file...' : 'Upload document'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>Browse</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              PDF, Markdown (.md), or TXT up to 50MB
            </p>
          </div>
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

        {/* Filter and Search Bar */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          boxShadow: 'var(--shadow-xs)'
        }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by name..."
              style={{
                width: '100%',
                padding: '6px 12px 6px 34px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                fontSize: '13px',
                backgroundColor: 'var(--bg-subtle)',
                outline: 'none',
              }}
            />
          </div>

          {/* Type Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {['all', 'pdf', 'md', 'txt'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className="btn btn-sm"
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  border: '1px solid',
                  borderColor: filterType === type ? 'var(--primary)' : 'var(--border-default)',
                  backgroundColor: filterType === type ? 'var(--primary-subtle)' : 'transparent',
                  color: filterType === type ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Full Width Document Master Table */}
      <div className="card" style={{ overflow: 'hidden', boxShadow: 'var(--shadow-xs)', border: '1px solid var(--border-default)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={24} className="spin-animate" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ fontSize: '13px', margin: 0 }}>Loading knowledge documents...</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={36} style={{ margin: '0 auto 14px auto', opacity: 0.4 }} />
            <p style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
              No documents found
            </p>
            <p style={{ fontSize: '13px', margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
              {searchQuery || filterType !== 'all'
                ? 'No documents match your filter query.'
                : 'Upload or drop your first file above to get started.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: '12px 18px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Document</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Size</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Sections</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Tokens</th>
                  <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '12px 18px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => {
                  const isProcessing = ['pending', 'parsing', 'chunking', 'indexing'].includes(doc.status)
                  const percent = getProgressPercent(doc.status)

                  return (
                    <tr
                      key={doc.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        backgroundColor: isProcessing ? 'var(--primary-subtle)' : 'var(--bg-surface)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* Document Name & Stepper */}
                      <td style={{ padding: '14px 18px', minWidth: '280px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: isProcessing ? 'var(--primary-subtle)' : 'var(--bg-subtle)',
                            border: '1px solid var(--border-default)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--primary)',
                            flexShrink: 0,
                          }}>
                            {isProcessing ? <Loader2 size={15} className="spin-animate" /> : getFileIcon(doc.file_type)}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {doc.filename}
                              </span>
                              {doc.isOptimistic && (
                                <span className="badge badge-mono" style={{ fontSize: '9px', padding: '1px 5px' }}>
                                  uploading
                                </span>
                              )}
                            </div>

                            {/* In-Place Processing Stages */}
                            {isProcessing ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <span className={`stage-step ${doc.status === 'pending' || doc.status === 'parsing' ? 'active pulse-soft' : 'done'}`}>
                                  {doc.status === 'pending' || doc.status === 'parsing' ? <Loader2 size={10} className="spin-animate" /> : <Check size={10} />}
                                  <span>1. Parsing</span>
                                </span>
                                <span className={`stage-step ${doc.status === 'chunking' ? 'active pulse-soft' : doc.status === 'indexing' || doc.status === 'ready' ? 'done' : 'waiting'}`}>
                                  {doc.status === 'chunking' ? <Loader2 size={10} className="spin-animate" /> : doc.status === 'indexing' || doc.status === 'ready' ? <Check size={10} /> : null}
                                  <span>2. Splitting</span>
                                </span>
                                <span className={`stage-step ${doc.status === 'indexing' ? 'active pulse-soft' : doc.status === 'ready' ? 'done' : 'waiting'}`}>
                                  {doc.status === 'indexing' ? <Loader2 size={10} className="spin-animate" /> : doc.status === 'ready' ? <Check size={10} /> : null}
                                  <span>3. Ready</span>
                                </span>
                              </div>
                            ) : (
                              doc.created_at && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  Added {new Date(doc.created_at).toLocaleDateString()}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </td>

                      {/* File Type */}
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                        {doc.file_type}
                      </td>

                      {/* File Size */}
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {formatBytes(doc.file_size_bytes)}
                      </td>

                      {/* Chunk Count */}
                      <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {doc.chunk_count || 0}
                      </td>

                      {/* Token Count */}
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {doc.token_count?.toLocaleString() || 0}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <span className={`badge ${
                          doc.status === 'ready' ? 'badge-success' :
                          doc.status === 'failed' ? 'badge-danger' :
                          doc.status === 'indexing' ? 'badge-warning' : 'badge-primary'
                        }`} style={{ fontSize: '10px' }}>
                          {doc.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          {!isProcessing && (
                            <button
                              onClick={() => handleInspectChunks(doc)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 10px', fontSize: '11px', gap: '4px' }}
                            >
                              <Layers size={13} />
                              <span>Inspect</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDelete(doc.id, e)}
                            className="btn btn-ghost btn-sm"
                            title="Delete file"
                            style={{ padding: '6px', color: 'var(--text-muted)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Content Inspector Drawer */}
      {selectedDoc && (
        <div className="drawer-overlay" onClick={() => { setSelectedDoc(null); setDocChunks([]) }}>
          <div
            className="drawer-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '640px', maxWidth: '100%' }}
          >
            {/* Inspector Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <Layers size={14} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Document Sections ({docChunks.length})
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedDoc.filename}
                </h3>
              </div>
              <button
                onClick={() => { setSelectedDoc(null); setDocChunks([]) }}
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Metadata Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 20px',
              backgroundColor: 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border-default)',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Size: </span><strong>{formatBytes(selectedDoc.file_size_bytes)}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Tokens: </span><strong>{selectedDoc.token_count?.toLocaleString()}</strong></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Format: </span><strong style={{ textTransform: 'uppercase' }}>{selectedDoc.file_type}</strong></div>
              </div>

              {/* In-Drawer Filter */}
              <div style={{ position: 'relative', width: '180px' }}>
                <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={chunkSearch}
                  onChange={(e) => {
                    setChunkSearch(e.target.value)
                    setChunkPage(1)
                  }}
                  placeholder="Filter text..."
                  style={{
                    width: '100%',
                    padding: '3px 8px 3px 26px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    fontSize: '11px',
                    backgroundColor: 'var(--bg-surface)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Chunks List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[var(--bg-canvas)]">
              {loadingChunks ? (
                <div className="py-20 text-center text-[var(--text-muted)]">
                  <Loader2 size={24} className="spin-animate mx-auto mb-3 text-blue-500" />
                  <p className="text-xs font-medium">Loading document content...</p>
                </div>
              ) : filteredChunks.length === 0 ? (
                <div className="py-20 text-center text-[var(--text-muted)]">
                  <Code2 size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {chunkSearch ? 'No matching text found' : 'No sections extracted'}
                  </p>
                </div>
              ) : (
                paginatedChunks.map((chunk) => {
                  const isCopied = copiedChunkId === chunk.id
                  const heading = chunk.chunk_metadata?.active_heading || chunk.chunk_metadata?.section_hierarchy?.[0]
                  return (
                    <div
                      key={chunk.id}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden shadow-xs hover:border-[var(--border-strong)] transition-all"
                    >
                      {/* Section Card Header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-subtle)] border-b border-[var(--border-default)]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] shadow-2xs">
                            Section #{chunk.chunk_index + 1}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] font-medium">
                            {chunk.token_count} tokens
                          </span>
                          {chunk.chunk_metadata?.page_number && (
                            <span className="text-[10px] text-[var(--text-muted)] font-medium bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">
                              p. {chunk.chunk_metadata.page_number}
                            </span>
                          )}
                          {heading && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20 max-w-[220px] truncate">
                              § {heading}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => copyChunkToClipboard(chunk.id, chunk.content, e)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shadow-2xs"
                        >
                          {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          <span className={isCopied ? 'text-emerald-500 font-semibold' : ''}>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      {/* Section Card Content Body */}
                      <div className="p-4 bg-[var(--bg-surface)] font-mono text-[12.5px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words max-h-72 overflow-y-auto selection:bg-blue-500/20">
                        {chunk.content ? (
                          chunk.content
                        ) : (
                          <span className="italic text-[var(--text-muted)]">No textual content extracted for this section.</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Pagination Controls Footer */}
            {filteredChunks.length > CHUNKS_PER_PAGE && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderTop: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                fontSize: '12px'
              }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  Showing {(safeChunkPage - 1) * CHUNKS_PER_PAGE + 1} - {Math.min(safeChunkPage * CHUNKS_PER_PAGE, filteredChunks.length)} of {filteredChunks.length} sections
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setChunkPage(p => Math.max(1, p - 1))}
                    disabled={safeChunkPage <= 1}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 10px', fontSize: '11px', gap: '4px' }}
                  >
                    <ChevronLeft size={13} />
                    <span>Previous</span>
                  </button>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', padding: '0 4px' }}>
                    {safeChunkPage} / {totalChunkPages}
                  </span>
                  <button
                    onClick={() => setChunkPage(p => Math.min(totalChunkPages, p + 1))}
                    disabled={safeChunkPage >= totalChunkPages}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '4px 10px', fontSize: '11px', gap: '4px' }}
                  >
                    <span>Next</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
