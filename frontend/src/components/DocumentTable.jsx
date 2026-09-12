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
  searchQuery,
  filterType,
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

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-default)] bg-[var(--bg-subtle)] font-semibold text-[var(--text-secondary)]">
              <th className="px-6 py-3.5">Document</th>
              <th className="px-4 py-3.5">Type</th>
              <th className="px-4 py-3.5">Size</th>
              <th className="px-4 py-3.5">Sections</th>
              <th className="px-4 py-3.5">Tokens</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-default)]">
            {documents.map((doc) => {
              const isProcessing = ['pending', 'parsing', 'chunking', 'indexing'].includes(doc.status)

              return (
                <tr
                  key={doc.id}
                  className={`transition-colors hover:bg-[var(--bg-surface-hover)] ${
                    isProcessing ? 'bg-blue-500/5' : ''
                  }`}
                >
                  {/* Filename & Stepper */}
                  <td className="px-6 py-4 min-w-[280px]">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-[var(--border-default)] ${
                        isProcessing ? 'bg-blue-500/10 text-blue-500' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                      }`}>
                        {isProcessing ? <Loader2 size={16} className="spin-animate" /> : getFileIcon(doc.file_type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                            {doc.filename}
                          </span>
                          {doc.isOptimistic && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-500 border border-blue-500/20">
                              uploading
                            </span>
                          )}
                        </div>

                        {/* Ingestion Steps */}
                        {isProcessing ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`stage-step ${doc.status === 'pending' || doc.status === 'parsing' ? 'active' : 'done'}`}>
                              {doc.status === 'pending' || doc.status === 'parsing' ? <Loader2 size={9} className="spin-animate" /> : <Check size={9} />}
                              <span>1. Parsing</span>
                            </span>
                            <span className={`stage-step ${doc.status === 'chunking' ? 'active' : doc.status === 'indexing' || doc.status === 'ready' ? 'done' : 'waiting'}`}>
                              {doc.status === 'chunking' ? <Loader2 size={9} className="spin-animate" /> : doc.status === 'indexing' || doc.status === 'ready' ? <Check size={9} /> : null}
                              <span>2. Splitting</span>
                            </span>
                            <span className={`stage-step ${doc.status === 'indexing' ? 'active' : doc.status === 'ready' ? 'done' : 'waiting'}`}>
                              {doc.status === 'indexing' ? <Loader2 size={9} className="spin-animate" /> : doc.status === 'ready' ? <Check size={9} /> : null}
                              <span>3. Ready</span>
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
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
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
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete file"
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
    </div>
  )
}
