import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { AlertCircle, CheckCircle2, X, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const { fetchQueue, setDrawerOpen, activeCount } = useTaskQueue()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deletingId, setDeletingId] = useState(null)
  const [isBatchDeleting, setIsBatchDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalChunks, setTotalChunks] = useState(0)
  const [totalTokens, setTotalTokens] = useState(0)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [docChunks, setDocChunks] = useState([])
  const [loadingChunks, setLoadingChunks] = useState(false)
  const [chunkSearch, setChunkSearch] = useState('')
  const [chunkPage, setChunkPage] = useState(1)
  const [copiedChunkId, setCopiedChunkId] = useState(null)
  const fileInputRef = useRef(null)
  const activeOptimisticIdsRef = useRef(new Set())

  // Debounce search query by 300ms
  useEffect(() => {
    setIsSearching(true)
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset page to 1 when filterType changes
  useEffect(() => {
    setPage(1)
  }, [filterType])

  const isInitialLoadRef = useRef(true)

  const fetchDocuments = useCallback(async (isBackground = false) => {
    if (!isBackground && isInitialLoadRef.current) {
      setLoading(true)
    }
    try {
      const token = tokenStorage.getToken()
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      })
      if (debouncedSearch.trim()) {
        params.append('q', debouncedSearch.trim())
      }
      if (filterType && filterType !== 'all') {
        params.append('file_type', filterType)
      }

      const res = await fetch(`/api/documents?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const items = data.items || []
        setTotalCount(data.total || 0)
        setTotalPages(data.total_pages || 1)
        if (data.total_chunks !== undefined) setTotalChunks(data.total_chunks)
        if (data.total_tokens !== undefined) setTotalTokens(data.total_tokens)

        setDocuments((prevDocs) => {
          // In-place diff check: avoid re-rendering entire table if data hasn't changed
          if (prevDocs.length === items.length) {
            let changed = false
            for (let i = 0; i < prevDocs.length; i++) {
              const a = prevDocs[i]
              const b = items[i]
              if (
                a.id !== b.id ||
                a.status !== b.status ||
                a.chunk_count !== b.chunk_count ||
                a.token_count !== b.token_count ||
                a.updated_at !== b.updated_at ||
                a.error_message !== b.error_message
              ) {
                changed = true
                break
              }
            }
            if (!changed) {
              return prevDocs
            }
          }

          return items
        })
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    } finally {
      isInitialLoadRef.current = false
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, filterType])

  const hasActiveDocs = documents.some((d) =>
    ['pending', 'parsing', 'chunking', 'indexing'].includes(d.status)
  )
  const hasActiveDocsRef = useRef(hasActiveDocs)
  hasActiveDocsRef.current = hasActiveDocs

  // Polling loop with dynamic interval: polls aggressively (1s) during active ingestion/upload
  useEffect(() => {
    let timeoutId
    let isMounted = true

    const runPoll = async () => {
      await fetchDocuments(true)
      if (!isMounted) return
      const interval = (hasActiveDocsRef.current || uploading) ? 1000 : 8000
      timeoutId = setTimeout(runPoll, interval)
    }

    runPoll()
    return () => {
      isMounted = false
      clearTimeout(timeoutId)
    }
  }, [fetchDocuments])

  const ALLOWED_EXTENSIONS = ['pdf', 'md', 'txt', 'docx', 'doc', 'csv', 'xlsx', 'xls']
  const MAX_BATCH_SIZE = 10
  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

  const handleFileUpload = async (filesInput) => {
    if (!filesInput) return
    if (uploading || hasActiveDocs) {
      notify.warning('Documents are currently being ingested. Please wait for processing to finish before uploading more files.')
      return
    }
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

    const formData = new FormData()
    fileList.forEach((file) => {
      formData.append('files', file)
    })

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

      // Provide clear, specific toast feedback based on details
      const uploadedItems = (data.details || []).filter((item) => item.status === 'uploaded')
      const duplicateItems = (data.details || []).filter((item) => item.is_duplicate)
      const failedItems = (data.details || []).filter((item) => item.status === 'failed')

      const successCount = data.successful_count ?? uploadedItems.length
      const dupCount = data.duplicate_count ?? duplicateItems.length
      const failCount = data.failed_count ?? failedItems.length

      if (successCount === 0 && dupCount > 0 && failCount === 0) {
        if (duplicateItems.length === 1) {
          notify.warning(duplicateItems[0].message || `Skipped duplicate '${duplicateItems[0].filename}': already exists in workspace.`, 'Duplicate Skipped')
        } else {
          notify.warning(`Skipped ${dupCount} duplicate file${dupCount === 1 ? '' : 's'} (identical name or content already exists).`, 'Duplicates Skipped')
        }
      } else if (failCount > 0) {
        const failMsg = failedItems.map((f) => `${f.filename}: ${f.message}`).slice(0, 2).join(' | ')
        notify.warning(
          `Uploaded ${successCount} file${successCount === 1 ? '' : 's'}` +
          (dupCount > 0 ? `, ${dupCount} skipped duplicate${dupCount === 1 ? '' : 's'}` : '') +
          `. ${failCount} failed: ${failMsg}`
        )
      } else if (dupCount > 0) {
        const uploadedNames = uploadedItems.map((u) => `'${u.filename}'`).join(', ')
        const skippedNames = duplicateItems.map((d) => `'${d.filename}'`).join(', ')
        if (duplicateItems.length === 1 && uploadedItems.length === 1) {
          notify.info(`Uploaded ${uploadedNames}. Skipped duplicate ${skippedNames} (${duplicateItems[0].duplicate_type === 'content' ? 'identical content' : 'name already exists'}).`, 'Upload Partial')
        } else {
          notify.info(`Uploaded ${successCount} file${successCount === 1 ? '' : 's'} (${uploadedNames}). Skipped ${dupCount} duplicate${dupCount === 1 ? '' : 's'} (${skippedNames}).`, 'Upload Partial')
        }
      } else if (successCount > 0) {
        notify.success(`Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}! Ingestion starting.`)
      } else {
        notify.info('No new documents were processed.')
      }

      // Immediately render confirmed server documents in the table
      const serverDocs = data.documents || []
      if (serverDocs.length > 0) {
        setDocuments((prev) => {
          const existingIds = new Set(prev.map((d) => d.id))
          const newItems = serverDocs.filter((d) => !existingIds.has(d.id))
          return [...newItems, ...prev]
        })
        setTotalCount((c) => c + serverDocs.length)
      }

      setUploading(false)
      fetchQueue()
      await fetchDocuments(true)

      // Turn off dropzone uploading state immediately so UI is responsive
      setUploading(false)

      // Sync queue telemetry and documents in background
      fetchQueue()
      await fetchDocuments(true)
    } catch (err) {
      notify.error(err.message || 'Failed to upload documents')
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

    setDeletingId(docId)
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
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleToggleSelectAll = () => {
    if (documents.length === 0) return
    const allSelected = documents.every((d) => selectedIds.has(d.id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)))
    }
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return

    const count = selectedIds.size
    const confirmed = await confirm({
      title: 'Delete Selected Documents',
      message: `Are you sure you want to permanently delete all ${count} selected document${count > 1 ? 's' : ''} and their chunks from vector & sparse search?`,
      confirmText: `Delete ${count} Document${count > 1 ? 's' : ''}`,
      variant: 'danger',
    })

    if (!confirmed) return

    setIsBatchDeleting(true)
    try {
      const token = tokenStorage.getToken()
      const res = await fetch('/api/documents/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ document_ids: Array.from(selectedIds) }),
      })

      if (res.ok) {
        const data = await res.json()
        notify.success(`Successfully deleted ${data.deleted_count} document${data.deleted_count > 1 ? 's' : ''}.`)
        setSelectedIds(new Set())
        await fetchDocuments()
        fetchQueue()
      } else {
        notify.error('Failed to batch delete documents')
      }
    } catch (err) {
      console.error('Batch delete error:', err)
      notify.error('Error executing batch delete')
    } finally {
      setIsBatchDeleting(false)
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

  // Summary Metrics: derived from optimized server aggregation
  const activeProcessingCount = documents.filter((d) =>
    ['pending', 'parsing', 'chunking', 'indexing'].includes(d.status)
  ).length

  const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const endRecord = Math.min(page * pageSize, totalCount)

  return (
    <div className="max-w-7xl w-full mx-auto px-6 sm:px-8 py-5 sm:py-6 space-y-4 sm:space-y-5 transition-colors">
      {/* Header Bar with Metrics */}
      <DocumentStatsHeader
        documentCount={totalCount}
        totalChunks={totalChunks}
        totalTokens={totalTokens}
      />

      {/* Hero Upload Dropzone */}
      <DocumentUploadDropzone
        uploading={uploading}
        hasActiveDocs={hasActiveDocs}
        activeCount={Math.max(activeCount, activeProcessingCount)}
        dragOver={dragOver}
        setDragOver={setDragOver}
        onFileSelect={handleFileUpload}
        fileInputRef={fileInputRef}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {/* Search & Filter Toolbar */}
      <DocumentToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterType={filterType}
        setFilterType={setFilterType}
        isSearching={isSearching}
        selectedCount={selectedIds.size}
        isBatchDeleting={isBatchDeleting}
        onBatchDelete={handleBatchDelete}
        onClearSelection={handleClearSelection}
      />

      {/* Documents Master Table */}
      <DocumentTable
        documents={documents}
        loading={loading}
        uploading={uploading}
        searchQuery={searchQuery}
        filterType={filterType}
        selectedIds={selectedIds}
        deletingId={deletingId}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        onInspect={handleInspectChunks}
        onDelete={handleDelete}
        onUploadClick={() => fileInputRef.current?.click()}
      />

      {/* Pagination Controls */}
      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-2 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-[var(--text-primary)]">{startRecord}</strong> to{' '}
              <strong className="text-[var(--text-primary)]">{endRecord}</strong> of{' '}
              <strong className="text-[var(--text-primary)]">{totalCount}</strong> documents
            </span>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 ml-2">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="px-2 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-blue-500/80 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-2xs cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>

            <div className="px-3 py-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)] font-semibold text-[var(--text-primary)]">
              Page {page} of {totalPages}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-2xs cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

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
