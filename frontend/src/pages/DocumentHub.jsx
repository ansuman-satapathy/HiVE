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

  const ALLOWED_EXTENSIONS = ['pdf', 'md', 'txt', 'docx', 'doc', 'csv', 'xlsx', 'xls']
  const MAX_BATCH_SIZE = 10
  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

  const handleFileUpload = async (filesInput) => {
    if (!filesInput) return
    const fileList = Array.isArray(filesInput) ? filesInput : [filesInput]
    if (fileList.length === 0) return

    // 1. Validate batch count
    if (fileList.length > MAX_BATCH_SIZE) {
      notify.error(`Maximum ${MAX_BATCH_SIZE} files can be uploaded at a time. You selected ${fileList.length} files.`)
      return
    }

    // 2. Validate format & size of each file
    const invalidFormatFiles = []
    const oversizedFiles = []

    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        invalidFormatFiles.push(file.name)
      }
      if (file.size > MAX_FILE_SIZE) {
        oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`)
      }
    }

    if (invalidFormatFiles.length > 0) {
      notify.error(`Unsupported format: ${invalidFormatFiles.join(', ')}. Allowed: PDF, Markdown, TXT, DOCX, CSV, Excel.`)
      return
    }

    if (oversizedFiles.length > 0) {
      notify.error(`Files exceed 50MB limit: ${oversizedFiles.join(', ')}`)
      return
    }

    setUploading(true)

    // Create optimistic entries in UI
    const optimisticDocs = fileList.map((file, idx) => {
      const ext = file.name.split('.').pop().toLowerCase()
      return {
        id: `opt-${Date.now()}-${idx}`,
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
    })

    setDocuments((prev) => [...optimisticDocs, ...prev])

    const formData = new FormData()
    fileList.forEach((file) => {
      formData.append('files', file)
    })

    const optIds = new Set(optimisticDocs.map((d) => d.id))

    try {
      const token = tokenStorage.getToken()
      const res = await fetch('/api/documents/upload-batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Batch upload failed')
      }

      // Remove temporary optimistic records before setting real server data
      setDocuments((prev) => prev.filter((d) => !optIds.has(d.id)))

      // Provide clear, specific toast feedback based on details
      if (data.duplicate_count > 0 && data.successful_count === 0 && data.failed_count === 0) {
        // All files were duplicates
        const dupMessages = (data.details || [])
          .filter((item) => item.is_duplicate)
          .map((item) => item.message)
        if (dupMessages.length === 1) {
          notify.info(dupMessages[0])
        } else {
          notify.info(`Skipped ${data.duplicate_count} duplicate files (identical name or content already exists).`)
        }
      } else if (data.failed_count > 0) {
        notify.warning(
          `Uploaded ${data.successful_count} file${data.successful_count === 1 ? '' : 's'}` +
          (data.duplicate_count > 0 ? `, ${data.duplicate_count} duplicate${data.duplicate_count === 1 ? '' : 's'} skipped` : '') +
          `, ${data.failed_count} failed.`
        )
      } else if (data.duplicate_count > 0) {
        notify.info(
          `Uploaded ${data.successful_count} file${data.successful_count === 1 ? '' : 's'} (${data.duplicate_count} duplicate${data.duplicate_count === 1 ? '' : 's'} skipped).`
        )
      } else {
        notify.success(`Successfully uploaded ${data.successful_count} file${data.successful_count > 1 ? 's' : ''}! Ingestion queued.`)
      }

      // Sync real documents and queue immediately
      fetchQueue()
      await fetchDocuments()
    } catch (err) {
      notify.error(err.message || 'Failed to upload documents')
      // Remove optimistic records
      setDocuments((prev) => prev.filter((d) => !optIds.has(d.id)))
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
