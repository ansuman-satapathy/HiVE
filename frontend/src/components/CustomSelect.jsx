import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Search, X } from 'lucide-react'

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select options...',
  isMulti = false,
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

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(filter.toLowerCase())
  )

  // Handle selection in multi vs single mode
  const handleSelect = (val) => {
    if (isMulti) {
      const currentValues = (Array.isArray(value) ? value : []).filter(Boolean)
      if (!val) {
        // Empty value represents "All Documents (Global)" -> reset to empty array
        onChange([])
      } else {
        const next = currentValues.includes(val)
          ? currentValues.filter((v) => v !== val)
          : [...currentValues, val]
        onChange(next)
      }
    } else {
      onChange(val || '')
      setOpen(false)
      setFilter('')
    }
  }

  // Clear all selections
  const handleClearAll = (e) => {
    e.stopPropagation()
    onChange(isMulti ? [] : '')
  }

  // Determine trigger display label
  const renderTriggerLabel = () => {
    if (isMulti) {
      const currentValues = Array.isArray(value) ? value : []
      if (currentValues.length === 0) {
        return (
          <span className="text-[var(--text-primary)]">
            All Documents (Global)
          </span>
        )
      }
      if (currentValues.length === 1) {
        const item = options.find((opt) => String(opt.value) === String(currentValues[0]))
        return <span className="truncate">{item ? item.label : '1 document selected'}</span>
      }
      return (
        <span className="font-semibold text-blue-500 flex items-center gap-1.5">
          <span>{currentValues.length} documents selected</span>
        </span>
      )
    }

    const selectedOption = options.find((opt) => String(opt.value) === String(value))
    return <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
  }

  const hasSelection = isMulti
    ? Array.isArray(value) && value.length > 0
    : Boolean(value)

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
        <div className="truncate flex-1">
          {renderTriggerLabel()}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <span
              role="button"
              onClick={handleClearAll}
              title="Reset to All Documents"
              className="p-0.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-[var(--text-muted)] transition-transform duration-150 ${
              open ? 'rotate-180 text-blue-500' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-full min-w-[240px] max-w-[320px] rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 flex flex-col">
          {/* Quick Search Filter */}
          {options.length > 4 && (
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
          <div className="max-h-60 overflow-y-auto space-y-0.5" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-[var(--text-muted)]">
                No matching documents
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = isMulti
                  ? !opt.value
                    ? !Array.isArray(value) || value.length === 0
                    : Array.isArray(value) && value.includes(opt.value)
                  : String(opt.value) === String(value)

                return (
                  <button
                    key={opt.value || 'all'}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/10 text-blue-500 font-semibold'
                        : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isMulti && (
                        <div
                          className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-[var(--border-strong)] bg-[var(--bg-surface)]'
                          }`}
                        >
                          {isSelected && <Check size={10} strokeWidth={3} />}
                        </div>
                      )}
                      <span className="truncate">{opt.label}</span>
                    </div>

                    {!isMulti && isSelected && (
                      <Check size={13} className="shrink-0 text-blue-500" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Multi-select footer info */}
          {isMulti && (
            <div className="pt-1.5 mt-1 border-t border-[var(--border-subtle)] px-2 py-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span>
                {Array.isArray(value) && value.length > 0
                  ? `${value.length} selected`
                  : 'All documents scoped'}
              </span>
              {Array.isArray(value) && value.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-blue-500 hover:text-blue-600 font-medium cursor-pointer"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
