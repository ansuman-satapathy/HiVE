import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
  ChevronRight,
  Database,
  Hash,
  FileCode,
  ArrowUpRight,
  Clock,
  BookOpen,
  Filter,
  Check,
  X,
  FileSpreadsheet,
  Copy,
  ExternalLink,
  Code2,
  Maximize2,
  Minimize2,
  SlidersHorizontal
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
  const [copiedChunkId, setCopiedChunkId] = useState(null)
  const [fullWidthInspector, setFullWidthInspector] = useState(false)
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
      const interval = hasActiveDocs ? 2000 : 15000
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
    if (selectedDoc?.id === doc.id) {
      setSelectedDoc(null)
      setDocChunks([])
      return
    }
    setSelectedDoc(doc)
    setChunkSearch('')
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

  const copyChunkToClipboard = (chunkId, text, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopiedChunkId(chunkId)
    setTimeout(() => setCopiedChunkId(null), 1800)
  }

  // Aggregate Metrics
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0)
  const totalTokens = documents.reduce((acc, d) => acc + (d.token_count || 0), 0)
  const activeProcessingCount = documents.filter((d) =>
    ['pending', 'parsing', 'chunking', 'indexing'].includes(d.status)
  ).length

  // Filtered Documents
  const filteredDocs = documents.filter((d) => {
    const matchesSearch = d.filename.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === 'all' || d.file_type?.toLowerCase() === filterType
    return matchesSearch && matchesType
  })

  // Filtered Chunks inside Inspector
  const filteredChunks = useMemo(() => {
    if (!chunkSearch) return docChunks
    const q = chunkSearch.toLowerCase()
    return docChunks.filter(c =>
      c.content?.toLowerCase().includes(q) ||
      c.chunk_metadata?.active_heading?.toLowerCase().includes(q)
    )
  }, [docChunks, chunkSearch])

  return (
    <div style={{ maxWidth: '1600px', width: '100%', margin: '0 auto', padding: '24px 32px' }}>
      {/* Top Header: Title & Clean Metrics Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px',
        paddingBottom: '18px',
        borderBottom: '1px solid var(--border-default)'
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--primary-subtle)', border: '1px solid var(--primary-border)', color: 'var(--primary)', fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>
            <Sparkles size={12} />
            <span>SEMANTIC CORPUS HUB</span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.4px', margin: 0, color: 'var(--text-primary)' }}>
            Corpus Documents
          </h1>
        </div>

        {/* Live Corpus Stats Strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="stat-chip">
            <Database size={14} style={{ color: 'var(--primary)' }} />
            <span>Files:</span>
            <strong>{documents.length}</strong>
          </div>

          <div className="stat-chip">
            <Layers size={14} style={{ color: '#0ea5e9' }} />
            <span>Semantic Chunks:</span>
            <strong>{totalChunks.toLocaleString()}</strong>
          </div>

          <div className="stat-chip">
            <Hash size={14} style={{ color: '#8b5cf6' }} />
            <span>Total Tokens:</span>
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
              <span>{activeProcessingCount} Ingesting</span>
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

      {/* Modern Compact Dropzone & Control Toolbar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 400px) 1fr',
        gap: '16px',
        alignItems: 'stretch',
        marginBottom: '20px'
      }}>
        {/* Compact Drag & Drop Upload Zone */}
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
            padding: '14px 18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            transition: 'all 0.15s ease',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div style={{
            width: '38px',
            height: '38px',
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {uploading ? 'Uploading & parsing...' : 'Drop files here to index'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>Browse</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Supports PDF, Markdown (.md), or TXT up to 50MB
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

        {/* Filter & Search Bar */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 18px',
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
                padding: '7px 12px 7px 34px',
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

      {/* Main Content Workspace: Responsive Split Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedDoc
          ? (fullWidthInspector ? '380px 1fr' : '1fr 1.05fr')
          : '1fr',
        gap: '20px',
        alignItems: 'start',
      }}>
        {/* Document Master List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loading ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={24} className="spin-animate" style={{ margin: '0 auto 12px auto' }} />
              <p style={{ fontSize: '13px', margin: 0 }}>Loading document workspace...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <FileText size={36} style={{ margin: '0 auto 14px auto', opacity: 0.4 }} />
              <p style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                No documents found
              </p>
              <p style={{ fontSize: '13px', margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                {searchQuery || filterType !== 'all'
                  ? 'No documents match your filter. Try adjusting your search query.'
                  : 'Drop or upload your first file above to start automated chunking and semantic indexing.'}
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id
              const isProcessing = ['pending', 'parsing', 'chunking', 'indexing'].includes(doc.status)
              const percent = getProgressPercent(doc.status)

              return (
                <div
                  key={doc.id}
                  onClick={() => !isProcessing && handleInspectChunks(doc)}
                  className="card"
                  style={{
                    padding: '12px 16px',
                    cursor: isProcessing ? 'default' : 'pointer',
                    border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border-default)',
                    backgroundColor: isSelected ? 'var(--primary-subtle)' : 'var(--bg-surface)',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 0 1px var(--primary)' : 'var(--shadow-xs)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Subtle top progress bar if processing */}
                  {isProcessing && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '3px',
                      backgroundColor: 'var(--border-default)',
                    }}>
                      <div
                        className="shimmer-progress"
                        style={{
                          height: '100%',
                          width: `${percent}%`,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
                    {/* Left: Type Icon + Title & Metadata */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: isProcessing ? 'var(--primary-subtle)' : 'var(--bg-subtle)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                        flexShrink: 0,
                      }}>
                        {isProcessing ? (
                          <Loader2 size={16} className="spin-animate" />
                        ) : (
                          getFileIcon(doc.file_type)
                        )}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <h3 style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            margin: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {doc.filename}
                          </h3>
                          {doc.isOptimistic && (
                            <span className="badge badge-mono" style={{ fontSize: '9px', padding: '1px 5px' }}>
                              uploading
                            </span>
                          )}
                        </div>

                        {/* In-Place Processing Stages Stepper */}
                        {isProcessing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                            <span className={`stage-step ${doc.status === 'pending' || doc.status === 'parsing' ? 'active pulse-soft' : 'done'}`}>
                              {doc.status === 'pending' || doc.status === 'parsing' ? (
                                <Loader2 size={10} className="spin-animate" />
                              ) : (
                                <Check size={10} />
                              )}
                              <span>1. Parsing</span>
                            </span>

                            <span className={`stage-step ${doc.status === 'chunking' ? 'active pulse-soft' : doc.status === 'indexing' || doc.status === 'ready' ? 'done' : 'waiting'}`}>
                              {doc.status === 'chunking' ? (
                                <Loader2 size={10} className="spin-animate" />
                              ) : doc.status === 'indexing' || doc.status === 'ready' ? (
                                <Check size={10} />
                              ) : null}
                              <span>2. Chunking</span>
                            </span>

                            <span className={`stage-step ${doc.status === 'indexing' ? 'active pulse-soft' : doc.status === 'ready' ? 'done' : 'waiting'}`}>
                              {doc.status === 'indexing' ? (
                                <Loader2 size={10} className="spin-animate" />
                              ) : doc.status === 'ready' ? (
                                <Check size={10} />
                              ) : null}
                              <span>3. Indexing</span>
                            </span>

                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                              ({formatBytes(doc.file_size_bytes)})
                            </span>
                          </div>
                        ) : (
                          /* Standard Ready Document Metadata */
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 500 }}>{formatBytes(doc.file_size_bytes)}</span>
                            <span>•</span>
                            <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{doc.file_type}</span>
                            <span>•</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{doc.chunk_count} chunks</span>
                            <span>•</span>
                            <span>{doc.token_count?.toLocaleString()} tokens</span>
                            {doc.created_at && (
                              <>
                                <span>•</span>
                                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Action & Status Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span className={`badge ${
                        doc.status === 'ready' ? 'badge-success' :
                        doc.status === 'failed' ? 'badge-danger' :
                        doc.status === 'indexing' ? 'badge-warning' : 'badge-primary'
                      }`} style={{ fontSize: '10px', padding: '2px 7px' }}>
                        {doc.status}
                      </span>

                      {!isProcessing && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleInspectChunks(doc)
                          }}
                          className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '4px 10px', fontSize: '11px', gap: '4px', height: '28px' }}
                        >
                          <Layers size={13} />
                          <span>{isSelected ? 'Viewing' : 'Inspect'}</span>
                        </button>
                      )}

                      <button
                        onClick={(e) => handleDelete(doc.id, e)}
                        className="btn btn-ghost btn-sm"
                        title="Delete document"
                        style={{ padding: '5px', color: 'var(--text-muted)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Right Pane: Redesigned Premium Chunk Inspector */}
        {selectedDoc && (
          <div className="card" style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 170px)',
            minHeight: '650px',
            position: 'sticky',
            top: '80px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-md)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden'
          }}>
            {/* Inspector Header with Title and Actions */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <Layers size={14} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                    Chunk Inspector
                  </span>
                  <span className="badge badge-mono" style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {docChunks.length} chunks
                  </span>
                </div>
                <h3 style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {selectedDoc.filename}
                </h3>
              </div>

              {/* Inspector Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setFullWidthInspector(!fullWidthInspector)}
                  className="btn btn-ghost btn-sm"
                  title={fullWidthInspector ? 'Standard Width' : 'Expand Inspector'}
                  style={{ padding: '6px' }}
                >
                  {fullWidthInspector ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button
                  onClick={() => { setSelectedDoc(null); setDocChunks([]) }}
                  className="btn btn-ghost btn-sm"
                  title="Close Inspector"
                  style={{ padding: '6px' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Document Quick Stats Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 20px',
              backgroundColor: 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border-default)',
              fontSize: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Size: </span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(selectedDoc.file_size_bytes)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Total Tokens: </span>
                  <strong style={{ color: 'var(--text-primary)' }}>{selectedDoc.token_count?.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Format: </span>
                  <strong style={{ color: 'var(--text-primary)', textTransform: 'uppercase' }}>{selectedDoc.file_type}</strong>
                </div>
              </div>

              {/* Search Inside Chunks */}
              <div style={{ position: 'relative', width: '200px' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  value={chunkSearch}
                  onChange={(e) => setChunkSearch(e.target.value)}
                  placeholder="Filter chunk text..."
                  style={{
                    width: '100%',
                    padding: '4px 8px 4px 26px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    fontSize: '11px',
                    backgroundColor: 'var(--bg-surface)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Chunks scroll view */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '16px 20px',
              backgroundColor: 'var(--bg-canvas)'
            }}>
              {loadingChunks ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Loader2 size={24} className="spin-animate" style={{ margin: '0 auto 12px auto' }} />
                  <p style={{ fontSize: '13px', margin: 0 }}>Retrieving semantic chunks...</p>
                </div>
              ) : filteredChunks.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Code2 size={32} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                  <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                    {chunkSearch ? 'No matching chunks' : 'No chunks extracted'}
                  </p>
                  <p style={{ fontSize: '12px', margin: 0 }}>
                    {chunkSearch ? 'Try a different filter term.' : 'Document is currently empty or indexing.'}
                  </p>
                </div>
              ) : (
                filteredChunks.map((chunk) => {
                  const isCopied = copiedChunkId === chunk.id
                  return (
                    <div
                      key={chunk.id}
                      className="chunk-item-card"
                    >
                      {/* Chunk Sub-Header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 14px',
                        backgroundColor: 'var(--bg-surface)',
                        gap: '10px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span className="badge badge-mono" style={{ fontSize: '10.5px', fontWeight: 600 }}>
                            Chunk #{chunk.chunk_index}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {chunk.token_count} tokens
                          </span>
                          {chunk.chunk_metadata?.active_heading && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--primary)',
                              backgroundColor: 'var(--primary-subtle)',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              maxWidth: '240px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              § {chunk.chunk_metadata.active_heading}
                            </span>
                          )}
                        </div>

                        {/* Copy Chunk Content Button */}
                        <button
                          onClick={(e) => copyChunkToClipboard(chunk.id, chunk.content, e)}
                          className="btn btn-ghost btn-sm"
                          style={{
                            padding: '3px 8px',
                            fontSize: '11px',
                            gap: '4px',
                            height: '24px',
                            color: isCopied ? 'var(--success)' : 'var(--text-secondary)'
                          }}
                        >
                          {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          <span>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      {/* Monospace Formatted Chunk Code Block */}
                      <div className="code-chunk-body">
                        {chunk.content}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
