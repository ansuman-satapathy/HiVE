import React from 'react'
import {
  Sparkles,
  FileText,
  X,
  Square,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

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
}) {
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
            className="w-full rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg hover:border-blue-500/30 transition-all duration-200 focus-within:border-blue-500/70 focus-within:shadow-xl focus-within:ring-3 focus-within:ring-blue-500/10 overflow-hidden"
          >
            {/* Input Textarea */}
            <textarea
              ref={textareaRef}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question about your documents... (Shift+Enter for newline)"
              rows={1}
              className="w-full resize-none px-4 pt-3.5 pb-2 text-[14px] leading-relaxed bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden max-h-48"
            />

            {/* Bottom Toolbar inside the Island */}
            <div className="px-3.5 pb-2.5 pt-1.5 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]/60 bg-[var(--bg-canvas)]/30">
              {/* Active Scope & Model in Composer Toolbar */}
              <div className="flex items-center gap-2 truncate">
                {/* Model Selector Pill */}
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-default)] text-[11px] text-[var(--text-secondary)] shadow-2xs shrink-0 cursor-default select-none"
                  title="Current Active Model (Custom API models coming soon)"
                >
                  <Sparkles size={11} className="text-blue-500" />
                  <span className="font-mono text-[10px] text-[var(--text-primary)] font-semibold">Llama 3.2 11B</span>
                </div>

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
                    disabled={!inputPrompt.trim()}
                    className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all cursor-pointer ${
                      inputPrompt.trim()
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] opacity-40 cursor-not-allowed'
                    }`}
                    title="Send message (Enter)"
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
              HiVE synthesizes answers from document context. AI may make mistakes; always verify critical information via citations.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
