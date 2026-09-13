import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { tokenStorage } from '../utils/storage'
import { useFeedback } from '../context/FeedbackContext'
import { useTaskQueue } from '../context/TaskQueueContext'
import DocumentStatsHeader from '../components/DocumentStatsHeader'
import DocumentUploadDropzone from '../components/DocumentUploadDropzone'
import DocumentToolbar from '../components/DocumentToolbar'
import DocumentTable from '../components/DocumentTable'
import DocumentChunkInspector from '../components/DocumentChunkInspector'

export default function DocumentHub() {
  const { notify, confirm } = useFeedback()
  const { fetchQueue, setDrawerOpen } = useTaskQueue()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
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
          const serverMap = new Map(data.map((d) => [d.id, d]))
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
      const interval = hasActiveDocs ? 1000 : 10000
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
      notify.error(`Unsupported file type .${ext}. Only PDF, Markdown (.md), and TXT are supported.`)
      return
    }

    setUploading(true)

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

    setDocuments((prev) => [optimisticDoc, ...prev.filter((d) => d.id !== tempId)])

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

      notify.success(data.message || 'File uploaded! Ingestion pipeline started.')
      if (data.document) {
        setDocuments((prev) => [
          data.document,
          ...prev.filter((d) => d.id !== tempId && d.id !== data.document.id),
        ])
      }

      // Immediately trigger live queue fetch and document sync
      fetchQueue()
      await fetchDocuments()
    } catch (err) {
      notify.error(err.message || 'Failed to upload document')
      setDocuments((prev) => prev.filter((d) => d.id !== tempId))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId, e) => {
    e.stopPropagation()
    const docToDelete = documents.find((d) => d.id === docId)
    const confirmed = await confirm({
      title: 'Delete Document',
      message: `Are you sure you want to delete "${docToDelete?.filename || 'this document'}" and all its indexed chunks from vector & sparse search?`,
      confirmText: 'Delete Document',
      variant: 'danger',
    })

    if (!confirmed) return

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
        notify.success('Document deleted successfully')
        fetchQueue()
      } else {
        notify.error('Failed to delete document')
      }
    } catch (err) {
      console.error('Failed to delete document:', err)
      notify.error('Error deleting document')
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

  // Summary Metrics
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0)
  const totalTokens = documents.reduce((acc, d) => acc + (d.token_count || 0), 0)
  const activeProcessingCount = documents.filter((d) =>
    ['pending', 'parsing', 'chunking', 'indexing'].includes(d.status)
  ).length

  // Filtered Documents
  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      const matchesSearch = d.filename.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = filterType === 'all' || d.file_type?.toLowerCase() === filterType
      return matchesSearch && matchesType
    })
  }, [documents, searchQuery, filterType])

  return (
    <div className="max-w-7xl w-full mx-auto px-6 sm:px-8 py-5 sm:py-6 space-y-4 sm:space-y-5 transition-colors">
      {/* Header Bar with Metrics */}
      <DocumentStatsHeader
        documentCount={documents.length}
        totalChunks={totalChunks}
        totalTokens={totalTokens}
        activeProcessingCount={activeProcessingCount}
      />

      {/* Hero Upload Dropzone */}
      <DocumentUploadDropzone
        uploading={uploading}
        dragOver={dragOver}
        setDragOver={setDragOver}
        onFileSelect={handleFileUpload}
        fileInputRef={fileInputRef}
      />

      {/* Search & Filter Toolbar */}
      <DocumentToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterType={filterType}
        setFilterType={setFilterType}
      />

      {/* Documents Master Table */}
      <DocumentTable
        documents={filteredDocs}
        loading={loading}
        searchQuery={searchQuery}
        filterType={filterType}
        onInspect={handleInspectChunks}
        onDelete={handleDelete}
        onUploadClick={() => fileInputRef.current?.click()}
      />

      {/* Slide-over Content Inspector Drawer */}
      <DocumentChunkInspector
        selectedDoc={selectedDoc}
        onClose={() => {
          setSelectedDoc(null)
          setDocChunks([])
        }}
        docChunks={docChunks}
        loadingChunks={loadingChunks}
        chunkSearch={chunkSearch}
        setChunkSearch={setChunkSearch}
        chunkPage={chunkPage}
        setChunkPage={setChunkPage}
        copiedChunkId={copiedChunkId}
        onCopyChunk={copyChunkToClipboard}
      />
    </div>
  )
}
