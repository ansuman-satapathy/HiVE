import { Link } from 'react-router-dom'
import { UploadCloud, MessageSquare, Terminal, ArrowUpRight } from 'lucide-react'

export default function WorkspaceHome() {
  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-12">
      {/* Hero Welcome */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-500 text-xs font-semibold mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          HiVE RUNTIME v0.2.0
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-3">
          Knowledge Base & Agent Intelligence
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
          A unified workspace for deep document parsing, hybrid retrieval, autonomous ReAct agent loops, and quantitative tabular calculation.
        </p>
      </div>

      {/* Feature Pillar Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-7 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col justify-between shadow-sm hover:border-[var(--border-strong)] transition-all">
          <div>
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center mb-5 shadow-xs">
              <UploadCloud size={22} />
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
              Document Ingestion & Chunker
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
              Upload PDFs, Markdown, and TXT files. Structural semantic chunking preserving headers, sections, and breadcrumb metadata.
            </p>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-default)]">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 uppercase tracking-wide">
              Live
            </span>
            <Link
              to="/workspace/documents"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
            >
              <span>Open Documents</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        <div className="p-7 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col justify-between shadow-sm hover:border-[var(--border-strong)] transition-all">
          <div>
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mb-5 shadow-xs">
              <MessageSquare size={22} />
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
              Hybrid Search & Agent Reasoning
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
              Dual BM25 + Dense vector retrieval with Reciprocal Rank Fusion, Cross-Encoder reranking, and live thought stream timelines.
            </p>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-default)]">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 uppercase tracking-wide">
              Live
            </span>
            <Link
              to="/workspace/chat"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
            >
              <span>Launch Chat</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        <div className="p-7 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col justify-between shadow-sm hover:border-[var(--border-strong)] transition-all">
          <div>
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mb-5 shadow-xs">
              <Terminal size={22} />
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
              Code Sandboxing & Tools
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
              Zero-hallucination quantitative calculations on structured tabular files, plus standard Model Context Protocol tool discovery.
            </p>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-default)]">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-default)]">
              Phase 5
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
