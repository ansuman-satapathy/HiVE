import { FileText, FileCode, FileSpreadsheet, Layers, Trash2, Loader2, Check } from 'lucide-react'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function getFileIcon(type) {
  switch (type?.toLowerCase()) {
    case 'pdf': return <FileText size={18} />
    case 'md': return <FileCode size={18} />
    case 'csv':
    case 'xlsx': return <FileSpreadsheet size={18} />
    default: return <FileText size={18} />
  }
}

export default function DocumentTable({
  documents,
  loading,
  uploading = false,
  searchQuery,
  filterType,
  selectedIds = new Set(),
  deletingId = null,
  onToggleSelect,
  onToggleSelectAll,
  onInspect,
  onDelete,
  onUploadClick
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-20 text-center">
        <Loader2 size={26} className="spin-animate mx-auto mb-3 text-blue-500" />
        <p className="text-xs font-medium text-[var(--text-muted)]">Loading documents...</p>
      </div>
    )
  }

  if (uploading && documents.length === 0) {
    return (
      <div className="rounded-2xl border border-blue-500/20 bg-[var(--bg-surface)] p-16 text-center shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-500 flex items-center justify-center mx-auto mb-4 ring-2 ring-blue-500/20">
          <Loader2 size={24} className="spin-animate text-blue-500" />
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
          Uploading Documents...
        </h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
          Files are uploading to your workspace. Table entries and ingestion status will display automatically once received.
        </p>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-16 text-center shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto mb-4">
          <FileText size={24} />
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
          No documents found
        </h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mb-5">
          {searchQuery || filterType !== 'all'
            ? 'No indexed documents match your current filter criteria.'
            : 'Upload or drop manuals, documentation, or txt files above to start indexing.'}
        </p>
        {onUploadClick && (
          <button
            onClick={onUploadClick}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all"
          >
            Upload First File
          </button>
        )}
      </div>
    )
  }

  const allSelected = documents.length > 0 && documents.every((d) => selectedIds.has(d.id))
  const someSelected = documents.some((d) => selectedIds.has(d.id)) && !allSelected

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
      <div className="w-full">
        <table className="w-full table-fixed text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)] font-semibold text-[var(--text-secondary)]">
              <th className="w-[4%] px-4 py-3.5 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={onToggleSelectAll}
                  className="table-checkbox"
                  aria-label="Select all documents"
                />
              </th>
              <th className="w-[34%] px-3 py-3.5">Document</th>
              <th className="w-[7%] px-3 py-3.5">Type</th>
              <th className="w-[9%] px-3 py-3.5">Size</th>
              <th className="w-[10%] px-3 py-3.5">Sections</th>
              <th className="w-[11%] px-3 py-3.5">Tokens</th>
              <th className="w-[11%] px-3 py-3.5">Status</th>
              <th className="w-[14%] px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-default)]">
            {documents.map((doc) => {
              const isProcessing = ['pending', 'parsing', 'chunking', 'indexing'].includes(doc.status)
              const isSelected = selectedIds.has(doc.id)

              return (
                <tr
                  key={doc.id}
                  className={`transition-colors hover:bg-[var(--bg-surface-hover)] ${
                    isSelected ? 'bg-blue-500/10' : isProcessing ? 'bg-blue-500/5' : ''
                  }`}
                >
                  {/* Row Checkbox */}
                  <td className="px-4 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(doc.id)}
                      className="table-checkbox"
                      aria-label={`Select ${doc.filename}`}
                    />
                  </td>

                  {/* Filename & Stepper */}
                  <td className="px-3 py-4 overflow-hidden">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isProcessing ? 'bg-blue-500/15 text-blue-500' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                      }`}>
                        {isProcessing ? <Loader2 size={16} className="spin-animate" /> : getFileIcon(doc.file_type)}
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="font-semibold text-[13px] text-[var(--text-primary)] truncate block flex-1"
                            title={doc.filename}
                          >
                            {doc.filename}
                          </span>
                          {doc.isOptimistic && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-500 border border-blue-500/20">
                              uploading
                            </span>
                          )}
                        </div>

                        {/* Streamlined Live Queue Progress Indicator */}
                        {isProcessing ? (
                          <div className="flex items-center gap-2 mt-1.5 max-w-[200px]">
                            <div className="flex-1 bg-[var(--bg-subtle)] border border-[var(--border-default)] h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-300 shimmer-progress"
                                style={{
                                  width: `${
                                    doc.status === 'pending' ? 20 :
                                    doc.status === 'parsing' ? 45 :
                                    doc.status === 'chunking' ? 70 :
                                    doc.status === 'indexing' ? 90 : 100
                                  }%`
                                }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-blue-500 font-medium capitalize">
                              {doc.status}...
                            </span>
                          </div>
                        ) : (
                          doc.created_at && (
                            <span className="text-[11px] text-[var(--text-muted)]">
                              Added {new Date(doc.created_at).toLocaleDateString()}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-4 uppercase font-semibold text-[var(--text-secondary)]">
                    {doc.file_type}
                  </td>

                  {/* Size */}
                  <td className="px-4 py-4 text-[var(--text-secondary)]">
                    {formatBytes(doc.file_size_bytes)}
                  </td>

                  {/* Section Count */}
                  <td className="px-4 py-4 font-bold text-[var(--text-primary)]">
                    {doc.chunk_count || 0}
                  </td>

                  {/* Token Count */}
                  <td className="px-4 py-4 text-[var(--text-secondary)] font-mono">
                    {doc.token_count?.toLocaleString() || 0}
                  </td>

                  {/* Status Badge */}
                  <td className="px-4 py-4">
                    <span className={`badge ${
                      doc.status === 'ready' ? 'badge-success' :
                      doc.status === 'failed' ? 'badge-danger' :
                      doc.status === 'indexing' ? 'badge-warning' : 'badge-info'
                    }`}>
                      {doc.status}
                    </span>
                  </td>

                  {/* Action Buttons */}
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5 shrink-0 whitespace-nowrap">
                      {!isProcessing && (
                        <button
                          onClick={() => onInspect(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-medium text-xs transition-all shadow-2xs"
                        >
                          <Layers size={13} className="text-blue-500" />
                          <span>Inspect</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => onDelete(doc.id, e)}
                        disabled={deletingId === doc.id}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title={deletingId === doc.id ? 'Deleting...' : 'Delete file'}
                      >
                        {deletingId === doc.id ? (
                          <Loader2 size={14} className="spin-animate text-red-500" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
