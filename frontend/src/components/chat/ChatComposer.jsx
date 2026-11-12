import React, { useState, useRef, useEffect } from 'react'
import {
  Sparkles,
  FileText,
  X,
  Square,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Check,
  Cpu,
  Settings,
  Plus,
  ShieldCheck,
} from 'lucide-react'

export const MAX_PROMPT_CHARS = 16000

export default function ChatComposer({
  inputPrompt,
  setInputPrompt,
  onSubmit,
  isStreaming,
  onAbort,
  selectedDocIds,
  setSelectedDocIds,
  documents,
  textareaRef,
  onKeyDown,
  showScrollBottom,
  hasMessages,
  onScrollToBottom,
  models = [],
  activeModelId = null,
  onSelectModel,
  groundingMode = 'hybrid',
  onChangeGroundingMode,
}) {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false)
      }
    }
    if (modelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [modelDropdownOpen])

  // Find currently active model details
  const currentModel = models.find((m) => m.id === activeModelId || m.model_name === activeModelId)
  const activeLabel = currentModel
    ? (currentModel.model_name || currentModel.name || currentModel.id)
    : (activeModelId || 'Default Model')

  const isOverLimit = inputPrompt.length > MAX_PROMPT_CHARS
  const showCharCount = inputPrompt.length > 8000
  return (
    <>
      {/* Floating "Scroll to Bottom" Pill */}
      {showScrollBottom && (hasMessages || isStreaming) && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2">
          <button
            type="button"
            onClick={onScrollToBottom}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] hover:border-blue-500/40 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium shadow-md hover:shadow-lg transition-all cursor-pointer backdrop-blur-md"
          >
            <ArrowDown size={13} className="text-blue-500 animate-bounce" />
            <span>Scroll to bottom</span>
          </button>
        </div>
      )}

      {/* Floating Input Island */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none pb-3 pt-10 bg-gradient-to-t from-[var(--bg-canvas)] via-[var(--bg-canvas)]/95 to-transparent flex flex-col items-center justify-end px-4 z-20">
        <div className="pointer-events-auto max-w-3xl w-full space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit()
            }}
            className="w-full rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg hover:border-blue-500/30 transition-all duration-200 focus-within:border-blue-500/70 focus-within:shadow-xl focus-within:ring-3 focus-within:ring-blue-500/10"
          >
            {/* Input Textarea */}
            <textarea
              ref={textareaRef}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question about your documents... (Shift+Enter for newline)"
              rows={1}
              className="w-full resize-none px-4 pt-3.5 pb-2 text-[14px] leading-relaxed bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden max-h-48 rounded-t-2xl"
            />

            {/* Bottom Toolbar inside the Island */}
            <div className="px-3.5 pb-2.5 pt-1.5 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]/60 bg-[var(--bg-canvas)]/30 rounded-b-2xl">
              {/* Active Scope & Model in Composer Toolbar */}
              <div className="flex items-center gap-2 min-w-0">
                {/* Interactive Model Selector Dropdown */}
                <div className="relative shrink-0" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setModelDropdownOpen((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] shadow-2xs transition-all cursor-pointer select-none group ${
                      modelDropdownOpen
                        ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400'
                        : 'bg-[var(--bg-subtle)] hover:bg-blue-500/10 border-[var(--border-default)] hover:border-blue-500/30 text-[var(--text-secondary)] hover:text-blue-500'
                    }`}
                    title="Click to switch active AI model"
                  >
                    <Sparkles size={11} className="text-blue-500 transition-transform group-hover:scale-110" />
                    <span className="font-mono text-[10px] text-[var(--text-primary)] font-semibold truncate max-w-[130px]">
                      {activeLabel}
                    </span>
                    {modelDropdownOpen ? (
                      <ChevronUp size={11} className="text-blue-500" />
                    ) : (
                      <ChevronDown size={11} className="text-[var(--text-muted)] group-hover:text-blue-500" />
                    )}
                  </button>

                  {/* Dropdown Menu Popup (Opens Upwards) */}
                  {modelDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-2.5 w-72 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl backdrop-blur-xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2">
                      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border-subtle)] mb-1.5">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                          <Sparkles size={11} className="text-blue-500" />
                          Switch Model
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold font-mono">
                          {models.length || 1} available
                        </span>
                      </div>

                      {/* Models List */}
                      <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
                        {models.length > 0 ? (
                          models.map((m) => {
                            const isSelected = m.id === activeModelId || m.model_name === activeModelId
                            return (
                              <button
                                key={m.id || m.model_name}
                                type="button"
                                onClick={() => {
                                  if (onSelectModel) onSelectModel(m.id || m.model_name)
                                  setModelDropdownOpen(false)
                                }}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium'
                                    : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Cpu size={13} className={isSelected ? 'text-blue-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'} />
                                  <div className="truncate">
                                    <div className="font-mono text-[11px] font-semibold truncate">{m.model_name || m.name || m.id}</div>
                                    <div className="text-[9.5px] text-[var(--text-muted)] capitalize flex items-center gap-1">
                                      <span>{m.provider || 'local'}</span>
                                      {m.is_active && (
                                        <span className="text-emerald-500 font-medium">• default</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {isSelected && <Check size={13} className="text-blue-500 shrink-0" />}
                              </button>
                            )
                          })
                        ) : (
                          <div className="px-3 py-2 text-center text-xs text-[var(--text-muted)]">
                            <span className="font-mono font-medium text-[var(--text-primary)]">{activeLabel}</span>
                            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Workspace active model</div>
                          </div>
                        )}
                      </div>

                      {/* Manage Models Action */}
                      <div className="border-t border-[var(--border-subtle)] mt-1.5 pt-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setModelDropdownOpen(false)
                            window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'model' } }))
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-[11px] text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 transition-colors font-medium cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Settings size={12} />
                            <span>Manage Models in Settings</span>
                          </span>
                          <span className="text-[10px] opacity-70">&rarr;</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Grounding Mode Toggle Pill */}
                <button
                  type="button"
                  onClick={() => onChangeGroundingMode?.(groundingMode === 'hybrid' ? 'strict' : 'hybrid')}
                  title={
                    groundingMode === 'hybrid'
                      ? 'Mode: Hybrid (Docs + AI) — Uses documents when relevant, and general knowledge for code & open questions. Click to switch to Strict Docs.'
                      : 'Mode: Strict Docs Only — Answers only using facts found in uploaded documents. Click to switch to Hybrid.'
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                    groundingMode === 'hybrid'
                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15'
                  }`}
                >
                  {groundingMode === 'hybrid' ? (
                    <>
                      <Sparkles size={11} className="text-blue-500 shrink-0" />
                      <span>Docs + AI</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={11} className="text-amber-500 shrink-0" />
                      <span>Strict Docs</span>
                    </>
                  )}
                </button>

                {/* Active Scope Pill */}
                {selectedDocIds.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-600 dark:text-blue-400 font-medium shadow-2xs">
                    <FileText size={11} />
                    <span className="truncate max-w-[150px]">
                      {selectedDocIds.length === 1
                        ? documents.find((d) => d.id === selectedDocIds[0])?.filename || '1 document'
                        : `${selectedDocIds.length} documents`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedDocIds([])}
                      className="hover:text-rose-500 cursor-pointer p-0.5 rounded-full"
                      title="Search all documents"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)] hidden sm:flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                    <span>All Documents</span>
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {showCharCount && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-colors select-none ${
                      isOverLimit
                        ? 'text-rose-500 bg-rose-500/10 border-rose-500/30 font-bold'
                        : 'text-[var(--text-muted)] bg-[var(--bg-subtle)] border-[var(--border-default)]'
                    }`}
                    title={
                      isOverLimit
                        ? `Prompt exceeds 16,000 characters by ${(inputPrompt.length - MAX_PROMPT_CHARS).toLocaleString()} chars. Please shorten it.`
                        : `${inputPrompt.length.toLocaleString()} / ${MAX_PROMPT_CHARS.toLocaleString()} characters`
                    }
                  >
                    {inputPrompt.length.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()}
                  </span>
                )}

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onAbort}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer animate-pulse"
                  >
                    <Square size={11} fill="currentColor" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputPrompt.trim() || isOverLimit}
                    className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all cursor-pointer ${
                      inputPrompt.trim() && !isOverLimit
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] opacity-40 cursor-not-allowed'
                    }`}
                    title={
                      isOverLimit
                        ? `Prompt is too long (exceeds ${MAX_PROMPT_CHARS.toLocaleString()} characters)`
                        : 'Send message (Enter)'
                    }
                  >
                    <ArrowUp size={15} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* AI Accuracy Disclaimer Notice */}
          <div className="text-center">
            <p className="text-[11px] text-[var(--text-muted)] leading-normal select-none">
              {groundingMode === 'hybrid'
                ? 'HiVE incorporates your documents with general AI reasoning. Always verify critical citations.'
                : 'HiVE answers strictly from uploaded documents and refuses outside knowledge.'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
