import { Layers, X, Search, Loader2, Code2, Check, Copy, ChevronLeft, ChevronRight } from 'lucide-react'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function DocumentChunkInspector({
  selectedDoc,
  onClose,
  docChunks,
  loadingChunks,
  chunkSearch,
  setChunkSearch,
  chunkPage,
  setChunkPage,
  copiedChunkId,
  onCopyChunk,
  pageSize = 10
}) {
  if (!selectedDoc) return null

  const filteredChunks = chunkSearch
    ? docChunks.filter(c =>
        c.content?.toLowerCase().includes(chunkSearch.toLowerCase()) ||
        c.chunk_metadata?.active_heading?.toLowerCase().includes(chunkSearch.toLowerCase())
      )
    : docChunks

  const totalChunkPages = Math.max(1, Math.ceil(filteredChunks.length / pageSize))
  const safeChunkPage = Math.min(chunkPage, totalChunkPages)
  const startIndex = (safeChunkPage - 1) * pageSize
  const paginatedChunks = filteredChunks.slice(startIndex, startIndex + pageSize)

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '640px', maxWidth: '100%' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Layers size={13} className="text-blue-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Document Sections ({docChunks.length})
              </span>
            </div>
            <h3 className="text-base font-bold text-[var(--text-primary)] truncate">
              {selectedDoc.filename}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Metadata Bar & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-3 border-b border-[var(--border-default)] bg-[var(--bg-subtle)] text-xs">
          <div className="flex items-center gap-3 text-[var(--text-secondary)]">
            <div>Size: <strong className="text-[var(--text-primary)]">{formatBytes(selectedDoc.file_size_bytes)}</strong></div>
            <div>Tokens: <strong className="text-[var(--text-primary)]">{selectedDoc.token_count?.toLocaleString()}</strong></div>
            <div>Format: <strong className="text-[var(--text-primary)] uppercase">{selectedDoc.file_type}</strong></div>
          </div>

          <div className="relative w-full sm:w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={chunkSearch}
              onChange={(e) => {
                setChunkSearch(e.target.value)
                setChunkPage(1)
              }}
              placeholder="Filter section text..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        {/* Chunks List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[var(--bg-canvas)]">
          {loadingChunks ? (
            <div className="py-20 text-center text-[var(--text-muted)]">
              <Loader2 size={24} className="spin-animate mx-auto mb-3 text-blue-500" />
              <p className="text-xs font-medium">Extracting document sections...</p>
            </div>
          ) : filteredChunks.length === 0 ? (
            <div className="py-20 text-center text-[var(--text-muted)]">
              <Code2 size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {chunkSearch ? 'No matching sections found' : 'No sections available'}
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
                  {/* Section Bar */}
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
                      onClick={(e) => onCopyChunk(chunk.id, chunk.content, e)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shadow-2xs"
                    >
                      {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      <span className={isCopied ? 'text-emerald-500 font-semibold' : ''}>{isCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {/* Text Content */}
                  <div className="p-4 bg-[var(--bg-surface)] font-mono text-[12.5px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words max-h-72 overflow-y-auto selection:bg-blue-500/20">
                    {chunk.content || <span className="italic text-[var(--text-muted)]">No textual content.</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination Footer */}
        {filteredChunks.length > pageSize && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-surface)] text-xs">
            <span className="text-[var(--text-muted)]">
              Showing {startIndex + 1} - {Math.min(startIndex + pageSize, filteredChunks.length)} of {filteredChunks.length} sections
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChunkPage(p => Math.max(1, p - 1))}
                disabled={safeChunkPage <= 1}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium flex items-center gap-1 transition-all"
              >
                <ChevronLeft size={13} />
                <span>Prev</span>
              </button>
              <span className="font-semibold text-[var(--text-primary)] px-1">
                {safeChunkPage} / {totalChunkPages}
              </span>
              <button
                onClick={() => setChunkPage(p => Math.min(totalChunkPages, p + 1))}
                disabled={safeChunkPage >= totalChunkPages}
                className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium flex items-center gap-1 transition-all"
              >
                <span>Next</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
