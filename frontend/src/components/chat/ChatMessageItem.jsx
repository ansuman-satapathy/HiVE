import React from 'react'
import {
  FileText,
  Copy,
  Check,
  Layers,
  Edit2,
  RefreshCw,
} from 'lucide-react'
import StreamingMarkdown from '../StreamingMarkdown'
import { HiveLogoIcon } from '../HiveLogo'

export default function ChatMessageItem({
  message,
  isLastTurn,
  isStreaming,
  isCopied,
  onCopy,
  onRegenerate,
  onCitationClick,
  // User turn editing props
  isEditing,
  editPromptText,
  setEditPromptText,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end w-full group animate-in fade-in">
        {isEditing ? (
          /* Inline User Message Editor */
          <div className="w-full max-w-2xl rounded-2xl p-3.5 bg-[var(--bg-surface)] border border-blue-500/40 shadow-md space-y-2.5">
            <textarea
              value={editPromptText}
              onChange={(e) => setEditPromptText(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-default)] text-xs sm:text-[13px] text-[var(--text-primary)] focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 leading-relaxed resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[var(--text-muted)]">
                Submitting will branch a new stream from this question
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="px-3 py-1 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs text-[var(--text-secondary)] cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onConfirmEdit(message.id)}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-all"
                >
                  Save & Re-run
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Standard User Message Pill */
          <div className="flex items-center gap-2 max-w-[85%] sm:max-w-[75%]">
            <button
              type="button"
              onClick={() => onStartEdit(message)}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer"
              title="Edit and re-run query"
            >
              <Edit2 size={13} />
            </button>

            <div className="rounded-2xl rounded-tr-xs px-4 py-2.5 bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] shadow-xs">
              <p className="text-[14px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap select-text font-normal">
                {message.content}
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Assistant Message
  return (
    <div className="flex gap-3.5 sm:gap-4 w-full group animate-in fade-in">
      {/* HiVE Brand Assistant Avatar */}
      <div className="w-7 h-7 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs overflow-hidden">
        <HiveLogoIcon size={18} />
      </div>

      {/* Open Reading Column */}
      <div className="flex-1 min-w-0 space-y-3">
        {message.isError ? (
          <div className="p-3.5 rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-medium">
            {message.content}
          </div>
        ) : (
          <StreamingMarkdown
            content={message.content}
            isStreaming={false}
            citations={message.citations || []}
            onCitationClick={onCitationClick}
          />
        )}

        {/* Citations Grounding Strip */}
        {message.citations && message.citations.length > 0 && (
          <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1 mr-1">
              <Layers size={12} /> Sources:
            </span>
            {message.citations.map((cite, cIdx) => (
              <button
                key={cIdx}
                type="button"
                onClick={() => onCitationClick(cite)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-500/50 hover:bg-blue-500/5 text-[11px] text-[var(--text-secondary)] hover:text-blue-500 transition-all cursor-pointer shadow-2xs"
              >
                <FileText size={11} className="text-blue-500" />
                <span className="truncate max-w-[140px] font-medium">{cite.document_title || 'Document'}</span>
                <span className="font-mono text-[10px] text-blue-500 font-bold">#{cite.chunk_index}</span>
              </button>
            ))}
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-[var(--text-muted)]">
          {!message.isError && (
            <button
              type="button"
              onClick={() => onCopy(message.content, message.id)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer text-[11px]"
            >
              {isCopied ? (
                <>
                  <Check size={11} className="text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={11} />
                  <span>Copy response</span>
                </>
              )}
            </button>
          )}

          {/* Regenerate / Retry Button on the latest turn */}
          {isLastTurn && !isStreaming && (
            <button
              type="button"
              onClick={onRegenerate}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-blue-500 transition-colors cursor-pointer text-[11px]"
              title="Regenerate this response"
            >
              <RefreshCw size={11} />
              <span>Regenerate</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
