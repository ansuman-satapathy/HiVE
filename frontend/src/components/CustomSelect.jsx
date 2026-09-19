import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option...',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && open) {
        setOpen(false)
        setFilter('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // Focus search input when opened if options > 5
  useEffect(() => {
    if (open && options.length > 5 && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [open, options.length])

  const selectedOption = options.find((opt) => String(opt.value) === String(value))

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open)
          setFilter('')
        }}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] hover:border-[var(--border-strong)] focus:border-blue-500/80 focus:outline-hidden transition-colors cursor-pointer shadow-2xs text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[var(--text-muted)] transition-transform duration-150 ${
            open ? 'rotate-180 text-blue-500' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-full min-w-[260px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 flex flex-col">
          {/* Quick Search when options list is long */}
          {options.length > 5 && (
            <div className="p-1 pb-1.5 mb-1 border-b border-[var(--border-subtle)]">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter documents..."
                  className="w-full pl-7 pr-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-blue-500/70"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-[var(--text-muted)]">
                No matching documents
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                      setFilter('')
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/10 text-blue-500 font-semibold'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={13} className="shrink-0 text-blue-500" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
