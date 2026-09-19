import { useState, useEffect, useRef } from 'react'
import {
  Search,
  SlidersHorizontal,
  Clock,
  Zap,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  ChevronRight,
  ChevronDown,
  Maximize2,
  X,
  FileText,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Info,
  ExternalLink,
  SplitSquareVertical,
} from 'lucide-react'
import { tokenStorage } from '../utils/storage'
import { useFeedback } from '../context/FeedbackContext'
import CustomSelect from '../components/CustomSelect'

export default function RetrievalPlayground() {
  const { notify } = useFeedback()

  // Search & Config States
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(6)
  const [rrfK, setRrfK] = useState(60)
  const [windowSize, setWindowSize] = useState(1)
  const [selectedDocIds, setSelectedDocIds] = useState([])
  const [documents, setDocuments] = useState([])
  const [showConfig, setShowConfig] = useState(false)

  // Results State
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'sparse' | 'dense' | 'hybrid' | 'rerank'

  // Context Expansion Modal State
  const [expansionModal, setExpansionModal] = useState(null)
  const [loadingExpansion, setLoadingExpansion] = useState(false)
  const [copied, setCopied] = useState(false)

  // Close modal on Escape key press
  useEffect(() => {
    if (!expansionModal) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setExpansionModal(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expansionModal])

  // Fetch document list for document filter dropdown
  useEffect(() => {
    async function loadDocs() {
      try {
        const token = tokenStorage.getToken()
        const res = await fetch('/api/documents?page=1&page_size=50', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const json = await res.json()
          setDocuments(json.items || json.documents || [])
        }
      } catch (err) {
        console.error('Failed to load documents filter list:', err)
      }
    }
    loadDocs()
  }, [])

  // Execute debug retrieval
  const handleExecuteSearch = async (e) => {
    if (e) e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    try {
      const token = tokenStorage.getToken()
      const res = await fetch('/api/retrieval/debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: query.trim(),
          top_k: Number(topK),
          rrf_k: Number(rrfK),
          window_size: Number(windowSize),
          expand_top_k: 1,
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || 'Retrieval pipeline request failed')
      }

      const resData = await res.json()
      setData(resData)
    } catch (err) {
      console.error('Retrieval debug error:', err)
      notify.error(err.message || 'Error executing retrieval debug query')
    } finally {
      setLoading(false)
    }
  }

  // Execute initial search only if query is present
  useEffect(() => {
    if (query.trim()) {
      handleExecuteSearch()
    }
  }, [])

  // Inspect or expand context for a chunk
  const handleExpandChunk = async (chunkId, docFilename) => {
    setLoadingExpansion(true)
    setExpansionModal({ chunkId, docFilename, loading: true })
    try {
      const token = tokenStorage.getToken()
      const res = await fetch(`/api/documents/chunks/${chunkId}/expand?window_size=${windowSize}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        throw new Error('Failed to expand context window')
      }
      const expData = await res.json()
      setExpansionModal(expData)
    } catch (err) {
      notify.error(err.message || 'Context expansion failed')
      setExpansionModal(null)
    } finally {
      setLoadingExpansion(false)
    }
  }

  const handleCopyText = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <SplitSquareVertical size={20} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                Retrieval Funnel Playground
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                Side-by-side diagnostic visualization for Sparse BM25, Dense Vector, RRF Hybrid, and Cross-Encoder Reranker
              </p>
            </div>
          </div>
        </div>

        {/* Config Toggle Button */}
        <button
          onClick={() => setShowConfig(!showConfig)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
            showConfig
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
              : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
          }`}
        >
          <SlidersHorizontal size={14} />
          <span>Pipeline Parameters</span>
          {showConfig ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {/* Query Search Bar */}
      <div className="p-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xs space-y-3">
        <form onSubmit={handleExecuteSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search query or error message to benchmark retrieval..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden focus:border-blue-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {loading ? <Zap size={14} className="animate-spin" /> : <Zap size={14} />}
            <span>{loading ? 'Evaluating...' : 'Run Pipeline'}</span>
          </button>
        </form>

        {/* Collapsible Tuning Panel */}
        {showConfig && (
          <div className="pt-3.5 mt-3 border-t border-[var(--border-default)] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--text-secondary)]">Top Candidates (top_k)</span>
                <span className="text-blue-500 font-bold font-mono">{topK}</span>
              </div>
              <input
                type="range"
                min={2}
                max={20}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="theme-slider cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--text-secondary)]">RRF Constant (k)</span>
                <span className="text-blue-500 font-bold font-mono">{rrfK}</span>
              </div>
              <input
                type="range"
                min={10}
                max={120}
                step={5}
                value={rrfK}
                onChange={(e) => setRrfK(Number(e.target.value))}
                className="theme-slider cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--text-secondary)]">Context Window (±chunks)</span>
                <span className="text-blue-500 font-bold font-mono">{windowSize}</span>
              </div>
              <input
                type="range"
                min={0}
                max={4}
                value={windowSize}
                onChange={(e) => setWindowSize(Number(e.target.value))}
                className="theme-slider cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--text-secondary)] block">
                Document Scope
              </label>
              <CustomSelect
                isMulti={true}
                value={selectedDocIds}
                onChange={setSelectedDocIds}
                placeholder="All Documents (Global)"
                options={[
                  { value: '', label: 'All Documents (Global)' },
                  ...documents.map((d) => ({ value: d.id, label: d.filename })),
                ]}
              />
            </div>
          </div>
        )}
      </div>

      {/* Empty State when no query has been run yet */}
      {!data && !loading && (
        <div className="py-16 px-4 text-center rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto mb-3">
            <Search size={22} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Ready to test retrieval</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto mt-1">
            Type any question, keyword, or error code above and click <span className="font-semibold text-blue-500">Run Pipeline</span> to evaluate your workspace's multi-stage retrieval funnel.
          </p>
        </div>
      )}

      {/* Latency & Stage Profile Header */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Total Latency
            </span>
            <div className="flex items-center gap-1 mt-1 text-sm font-bold text-blue-600 dark:text-blue-400">
              <Clock size={14} />
              <span>{data.total_latency_ms.toFixed(1)} ms</span>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Stage 1: Sparse BM25
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-[var(--text-primary)]">
              <span>{data.sparse_stage.latency_ms.toFixed(1)} ms</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-500">
                {data.sparse_stage.count} hits
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Stage 2: Dense Vector
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-[var(--text-primary)]">
              <span>{data.dense_stage.latency_ms.toFixed(1)} ms</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-500">
                {data.dense_stage.count} hits
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Stage 3: Hybrid RRF
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-[var(--text-primary)]">
              <span>{data.hybrid_stage.latency_ms.toFixed(1)} ms</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                k={data.hybrid_stage.rrf_k}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] block">
              Stage 4: Reranker
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-[var(--text-primary)]">
              <span>{data.rerank_stage.latency_ms.toFixed(1)} ms</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600">
                {data.rerank_stage.reranker_used.includes('local') ? 'Fast Cross-Scorer' : 'NVIDIA NIM'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4-Stage Side-by-Side Funnel Grid */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column 1: Sparse BM25 */}
          <div className="flex flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-default)] bg-slate-500/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                <h2 className="text-xs font-bold text-[var(--text-primary)]">1. Sparse BM25</h2>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                {data.sparse_stage.results.length} results
              </span>
            </div>

            <div className="p-3 space-y-2.5 flex-1 overflow-y-auto max-h-[600px]">
              {data.sparse_stage.results.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No lexical keyword matches
                </div>
              ) : (
                data.sparse_stage.results.map((item, idx) => (
                  <div
                    key={item.chunk_id || idx}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-slate-400/40 transition-all text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text-primary)]">#{idx + 1}</span>
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400">
                        Score: {item.bm25_score}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {item.content}
                    </p>
                    <div className="pt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
                      <span>Chunk {item.chunk_index}</span>
                      <span>{item.token_count} tok</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Dense Vector Search */}
          <div className="flex flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-default)] bg-purple-500/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <h2 className="text-xs font-bold text-[var(--text-primary)]">2. Dense Vector</h2>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                {data.dense_stage.results.length} results
              </span>
            </div>

            <div className="p-3 space-y-2.5 flex-1 overflow-y-auto max-h-[600px]">
              {data.dense_stage.results.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No semantic vector matches
                </div>
              ) : (
                data.dense_stage.results.map((item, idx) => (
                  <div
                    key={item.chunk_id || idx}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-purple-400/40 transition-all text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-[var(--text-primary)]">#{idx + 1}</span>
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        CosSim: {(item.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="line-clamp-3 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {item.content}
                    </p>
                    <div className="pt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
                      <span>Chunk {item.chunk_index}</span>
                      <span>{item.token_count} tok</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: Hybrid RRF Merger */}
          <div className="flex flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-default)] bg-emerald-500/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h2 className="text-xs font-bold text-[var(--text-primary)]">3. Hybrid RRF Fusion</h2>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                {data.hybrid_stage.results.length} fused
              </span>
            </div>

            <div className="p-3 space-y-2.5 flex-1 overflow-y-auto max-h-[600px]">
              {data.hybrid_stage.results.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No hybrid fused results
                </div>
              ) : (
                data.hybrid_stage.results.map((item, idx) => (
                  <div
                    key={item.chunk_id || idx}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-emerald-400/40 transition-all text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-[var(--text-primary)]">#{idx + 1}</span>
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        RRF: {item.rrf_score?.toFixed(4)}
                      </span>
                    </div>

                    <p className="line-clamp-3 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {item.content}
                    </p>

                    <div className="pt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
                      <div className="flex items-center gap-1 font-mono">
                        {item.dense_rank && <span className="text-purple-600">D:{item.dense_rank}</span>}
                        {item.dense_rank && item.sparse_rank && <span>·</span>}
                        {item.sparse_rank && <span className="text-slate-600">S:{item.sparse_rank}</span>}
                      </div>
                      <span>Chunk {item.chunk_index}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 4: Cross-Encoder Rerank (Final Output) */}
          <div className="flex flex-col rounded-2xl border border-amber-500/30 bg-[var(--bg-surface)] overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h2 className="text-xs font-bold text-[var(--text-primary)]">4. Final Rerank</h2>
              </div>
              <span className="text-[11px] font-mono text-amber-600 font-bold">
                Top {data.rerank_stage.results.length}
              </span>
            </div>

            <div className="p-3 space-y-2.5 flex-1 overflow-y-auto max-h-[600px]">
              {data.rerank_stage.results.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No reranked candidates
                </div>
              ) : (
                data.rerank_stage.results.map((item, idx) => {
                  const delta = item.rank_delta || 0
                  return (
                    <div
                      key={item.chunk_id || idx}
                      className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] hover:border-amber-500/40 transition-all text-xs space-y-1.5 group"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[var(--text-primary)]">#{idx + 1}</span>
                          {/* Rank Shift Indicator */}
                          {delta > 0 && (
                            <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-bold">
                              <TrendingUp size={11} className="mr-0.5" /> +{delta}
                            </span>
                          )}
                          {delta < 0 && (
                            <span className="inline-flex items-center text-rose-600 dark:text-rose-400 font-bold">
                              <TrendingDown size={11} className="mr-0.5" /> {delta}
                            </span>
                          )}
                          {delta === 0 && (
                            <span className="inline-flex items-center text-[var(--text-muted)] font-mono">
                              <Minus size={10} /> 0
                            </span>
                          )}
                        </div>

                        <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          Score: {item.rerank_score?.toFixed(4)}
                        </span>
                      </div>

                      <p className="line-clamp-3 text-[11px] text-[var(--text-primary)] font-medium leading-relaxed">
                        {item.content}
                      </p>

                      <div className="pt-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)] border-t border-amber-500/10">
                        <span>Chunk {item.chunk_index}</span>
                        <button
                          onClick={() => handleExpandChunk(item.chunk_id, item.chunk_metadata?.filename || 'Document')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium transition-colors cursor-pointer"
                          title="Expand context window with sibling chunks"
                        >
                          <Maximize2 size={10} />
                          <span>Expand</span>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Window Preview Drawer/Modal */}
      {expansionModal && (
        <div
          onClick={() => setExpansionModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Maximize2 size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Reconstructed Context Window (Small-to-Big)
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {expansionModal.document_filename || 'Target Document'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setExpansionModal(null)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {loadingExpansion ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
                  <Zap size={16} className="animate-spin text-blue-500" />
                  <span>Stitching adjacent sibling chunks and deduplicating boundaries...</span>
                </div>
              ) : (
                <>
                  {/* Meta Chips */}
                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 font-medium">
                      Included Chunks: {expansionModal.included_chunk_indices?.join(', ')}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-500 font-mono">
                      {expansionModal.token_count} Total Tokens
                    </span>
                    {expansionModal.section_breadcrumbs?.map((sec) => (
                      <span key={sec} className="px-2 py-0.5 rounded-md bg-slate-500/10 text-[var(--text-secondary)]">
                        {sec}
                      </span>
                    ))}
                  </div>

                  {/* Expanded Merged Content */}
                  <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] leading-relaxed font-sans whitespace-pre-wrap select-text">
                    {expansionModal.expanded_text}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-surface)] flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-muted)]">
                Pass this expanded context directly into prompt generation models
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyText(expansionModal.expanded_text || '')}
                  disabled={!expansionModal.expanded_text}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
                >
                  {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy Text'}</span>
                </button>
                <button
                  onClick={() => setExpansionModal(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
