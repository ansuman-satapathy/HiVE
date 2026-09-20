import React, { useEffect, useState } from 'react'
import {
  X,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Sparkles,
  Bookmark,
  ShieldCheck,
  Hash,
} from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * Slide-out grounding inspection drawer.
 * Displays exact retrieved chunk excerpt, relevance confidence score,
 * document origin metadata, and deep link into Document Hub.
 */
export default function CitationSourceDrawer({
  citation,
  onClose,
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!citation) return null

  const handleCopy = () => {
    if (!citation.content) return
    navigator.clipboard.writeText(citation.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const relevance = citation.relevance_score
  let scoreBadgeColor = 'text-blue-500 bg-blue-500/10 border-blue-500/20'
  let scoreLabel = 'Relevant'
  if (relevance !== null && relevance !== undefined) {
    if (relevance >= 0.75) {
      scoreBadgeColor = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
      scoreLabel = 'High Confidence'
    } else if (relevance >= 0.4) {
      scoreBadgeColor = 'text-blue-500 bg-blue-500/10 border-blue-500/20'
      scoreLabel = 'Moderate Confidence'
    } else {
      scoreBadgeColor = 'text-amber-500 bg-amber-500/10 border-amber-500/20'
      scoreLabel = 'Contextual Support'
    }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '520px', maxWidth: '100%' }}
      >
        {/* Drawer Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wide uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <ShieldCheck size={12} />
                Grounding Source
              </span>

              {relevance !== null && relevance !== undefined && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold border ${scoreBadgeColor}`}>
                  <Sparkles size={11} />
                  {scoreLabel} ({relevance})
                </span>
              )}
            </div>

            <h3 className="text-base font-bold text-[var(--text-primary)] truncate" title={citation.document_title}>
              {citation.document_title || 'Document Excerpt'}
            </h3>

            {citation.active_heading && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate flex items-center gap-1">
                <Bookmark size={11} className="text-blue-500 shrink-0" />
                <span className="truncate">{citation.active_heading}</span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer shrink-0"
            title="Close drawer (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-1">
              <span className="text-[10.5px] uppercase font-bold text-[var(--text-muted)] flex items-center gap-1">
                <Hash size={11} className="text-blue-500" />
                Chunk Sequence
              </span>
              <p className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                Chunk #{citation.chunk_index ?? 0}
              </p>
            </div>

            <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-1">
              <span className="text-[10.5px] uppercase font-bold text-[var(--text-muted)] flex items-center gap-1">
                <Layers size={11} className="text-sky-500" />
                Token Volume
              </span>
              <p className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                {citation.token_count && citation.token_count > 0
                  ? `${citation.token_count} tokens`
                  : 'Approx. ~250 tokens'}
              </p>
            </div>
          </div>

          {/* Excerpt Body */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Exact Retrieved Excerpt:
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-2xs"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-emerald-500" />
                    <span className="text-emerald-500 font-semibold">Copied excerpt</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy excerpt</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] text-[12.5px] text-[var(--text-primary)] font-mono leading-relaxed whitespace-pre-wrap select-text max-h-96 overflow-y-auto shadow-inner border-l-[3px] border-l-blue-500">
              {citation.content
                ? citation.content
                : (
                  <span className="text-[var(--text-muted)] italic">
                    Chunk content not available in this session.
                    {citation.chunk_id && (
                      <><br /><br />Chunk ID: <span className="not-italic text-blue-400">{citation.chunk_id}</span></>
                    )}
                  </span>
                )
              }
            </div>
          </div>

          {/* Context Explainer */}
          <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-[var(--text-secondary)] space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
              <Sparkles size={13} />
              <span>Grounding Verification</span>
            </div>
            <p className="leading-normal text-[11.5px]">
              This excerpt was retrieved via hybrid sparse & dense indexing, re-ranked with a cross-encoder model, and provided directly to the LLM to verify and ground its answer.
            </p>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-default)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
          {citation.document_id ? (
            <Link
              to={`/documents?search=${encodeURIComponent(citation.document_title || '')}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors"
            >
              <FileText size={13} />
              <span>View in Knowledge Base</span>
              <ExternalLink size={11} />
            </Link>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
