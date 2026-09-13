import { Database, Layers, Hash } from 'lucide-react'

export default function DocumentStatsHeader({
  documentCount,
  totalChunks,
  totalTokens
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-1">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-0.5">
          Knowledge Base
        </h1>
        <p className="text-xs text-[var(--text-secondary)]">
          Manage indexed corpus manuals, technical guides, and documents for autonomous agent reasoning.
        </p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs shadow-2xs">
          <Database size={14} className="text-blue-500" />
          <span className="text-[var(--text-secondary)]">Documents:</span>
          <strong className="font-bold text-[var(--text-primary)]">{documentCount}</strong>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs shadow-2xs">
          <Layers size={14} className="text-sky-500" />
          <span className="text-[var(--text-secondary)]">Sections:</span>
          <strong className="font-bold text-[var(--text-primary)]">{totalChunks.toLocaleString()}</strong>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs shadow-2xs">
          <Hash size={14} className="text-violet-500" />
          <span className="text-[var(--text-secondary)]">Tokens:</span>
          <strong className="font-bold text-[var(--text-primary)]">{totalTokens.toLocaleString()}</strong>
        </div>
      </div>
    </div>
  )
}
