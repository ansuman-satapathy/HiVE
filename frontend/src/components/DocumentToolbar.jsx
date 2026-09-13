import { Search, Loader2, Trash2, CheckSquare } from 'lucide-react'

export default function DocumentToolbar({
  searchQuery,
  setSearchQuery,
  filterType,
  setFilterType,
  isSearching,
  selectedCount,
  isBatchDeleting,
  onBatchDelete,
  onClearSelection,
}) {
  const filterOptions = [
    { key: 'all', label: 'All' },
    { key: 'pdf', label: 'PDF' },
    { key: 'docx', label: 'DOCX' },
    { key: 'md', label: 'MD' },
    { key: 'txt', label: 'TXT' },
    { key: 'csv', label: 'CSV' },
    { key: 'xlsx', label: 'XLSX' },
  ]

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        {/* Search Input with AJAX loading spinner */}
        <div className="relative flex-1">
          {isSearching ? (
            <Loader2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-500 spin-animate" />
          ) : (
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          )}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by filename..."
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/80 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Clean, subtle Batch Actions Bar */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] text-xs shrink-0 shadow-2xs animate-in fade-in duration-150">
            <span className="font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
              <CheckSquare size={13} className="text-blue-500" />
              <strong className="text-[var(--text-primary)] font-semibold">{selectedCount}</strong>
              <span>selected</span>
            </span>
            <div className="h-3.5 w-px bg-[var(--border-default)] mx-1" />
            <button
              onClick={onBatchDelete}
              disabled={isBatchDeleting}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 disabled:opacity-50 disabled:pointer-events-none font-medium text-xs transition-colors cursor-pointer"
            >
              {isBatchDeleting ? (
                <Loader2 size={12} className="spin-animate" />
              ) : (
                <Trash2 size={12} />
              )}
              <span>{isBatchDeleting ? 'Deleting...' : 'Delete'}</span>
            </button>
            <button
              onClick={onClearSelection}
              disabled={isBatchDeleting}
              className="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-md hover:bg-[var(--bg-subtle)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Format Filter Badges */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-2xs">
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilterType(opt.key)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              filterType === opt.key
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
