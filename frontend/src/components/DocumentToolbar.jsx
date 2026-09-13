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
    { key: 'docx', label: 'DOCX' },
    { key: 'md', label: 'MD' },
    { key: 'txt', label: 'TXT' },
    { key: 'csv', label: 'CSV' },
    { key: 'xlsx', label: 'XLSX' },
  ]

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter indexed documents by filename..."
          className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/80 transition-all shadow-2xs"
        />
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
