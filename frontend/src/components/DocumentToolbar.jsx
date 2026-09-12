import { Search } from 'lucide-react'

export default function DocumentToolbar({
  searchQuery,
  setSearchQuery,
  filterType,
  setFilterType,
  onUploadClick
}) {
  const filterOptions = [
    { key: 'all', label: 'All' },
    { key: 'pdf', label: 'PDF' },
    { key: 'md', label: 'MD' },
    { key: 'txt', label: 'TXT' },
  ]

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xs">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter indexed documents by filename..."
          className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
        />
      </div>

      {/* Format Filter Badges & Quick Upload Button */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-default)]">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilterType(opt.key)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                filterType === opt.key
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {onUploadClick && (
          <button
            onClick={onUploadClick}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 ml-1"
          >
            <span>+ Upload</span>
          </button>
        )}
      </div>
    </div>
  )
}
