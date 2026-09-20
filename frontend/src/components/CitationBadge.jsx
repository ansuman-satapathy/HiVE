import React from 'react'
import { FileText } from 'lucide-react'

/**
 * Interactive inline citation badge rendered within markdown text.
 * Represents a reference to a retrieved chunk (e.g., [1] or [doc:chunk_id]).
 */
export default function CitationBadge({
  citation,
  chunkId,
  index = 1,
  onClick,
}) {
  const title = citation?.document_title || 'Document Excerpt'
  const chunkIndex = citation?.chunk_index !== undefined ? citation.chunk_index : null
  const relevance = citation?.relevance_score

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (onClick) {
      onClick(citation || { chunk_id: chunkId, document_title: title, chunk_index: chunkIndex })
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`${title}${chunkIndex !== null ? ` (Chunk #${chunkIndex})` : ''}${relevance ? ` • Score: ${relevance}` : ''}\nClick to inspect source grounding`}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 mx-0.5 -translate-y-0.5 rounded-md text-[11px] font-mono font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-blue-700 dark:hover:text-blue-300 transition-all cursor-pointer select-none align-baseline shadow-2xs group"
    >
      <FileText size={10} className="text-blue-500/70 group-hover:text-blue-500" />
      <span>{index}</span>
    </button>
  )
}
