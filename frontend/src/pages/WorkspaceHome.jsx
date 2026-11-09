import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  UploadCloud,
  MessageSquare,
  SlidersHorizontal,
  Layers,
  Database,
  Hash,
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  FileText,
  FileCode,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Radio,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  ChevronRight,
  ShieldCheck,
  Bot
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { tokenStorage } from '../utils/storage'

const SESSIONS_STORAGE_KEY = 'hive_chat_sessions_v1'
const LEGACY_SESSIONS_STORAGE_KEY = 'quickdesk_chat_sessions_v1'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function timeAgo(dateString) {
  if (!dateString) return 'recently'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'recently'
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getFileIcon(type) {
  switch (type?.toLowerCase()) {
    case 'pdf':
      return <FileText size={16} className="text-rose-500" />
    case 'md':
    case 'markdown':
      return <FileCode size={16} className="text-sky-500" />
    case 'csv':
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet size={16} className="text-emerald-500" />
    default:
      return <FileText size={16} className="text-blue-500" />
  }
}

export default function WorkspaceHome() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [documents, setDocuments] = useState([])
  const [stats, setStats] = useState({
    totalDocs: 0,
    totalChunks: 0,
    totalTokens: 0,
  })
  const [profilesCount, setProfilesCount] = useState(3)
  const [copiedMcp, setCopiedMcp] = useState(false)

  // Read chat sessions from localStorage
  const recentSessions = useMemo(() => {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY) || localStorage.getItem(LEGACY_SESSIONS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4)
        : []
    } catch {
      return []
    }
  }, [])

  const fetchDashboardData = async (isManual = false) => {
    if (isManual) setRefreshing(true)
    const token = tokenStorage.getToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    try {
      // 1. Fetch recent documents & total stats
      const docsRes = await fetch('/api/documents?page=1&page_size=5', { headers })
      if (docsRes.ok) {
        const data = await docsRes.json()
        setDocuments(data.items || [])
        setStats({
          totalDocs: data.total || 0,
          totalChunks: data.total_chunks || 0,
          totalTokens: data.total_tokens || 0,
        })
      }

      // 2. Fetch profiles count
      const profilesRes = await fetch('/api/retrieval-profiles', { headers })
      if (profilesRes.ok) {
        const profiles = await profilesRes.json()
        if (Array.isArray(profiles)) {
          setProfilesCount(profiles.length)
        }
      }
    } catch (err) {
      console.warn('Dashboard telemetry fetch error:', err)
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const mcpConfigCode = JSON.stringify(
    {
      mcpServers: {
        hive: {
          url: `${window.location.origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${tokenStorage.getToken() || '<YOUR_JWT_TOKEN>'}`,
          },
        },
      },
    },
    null,
    2
  )

  const handleCopyMcp = () => {
    navigator.clipboard.writeText(mcpConfigCode)
    setCopiedMcp(true)
    setTimeout(() => setCopiedMcp(false), 2000)
  }

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* ── 1. Hero Header & Quick Actions ── */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 pb-2 border-b border-[var(--border-default)]">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-500 text-xs font-semibold mb-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            HiVE v0.2.0
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Welcome back{user?.full_name ? `, ${user.full_name}` : ''}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 max-w-2xl leading-relaxed">
            Search documents, ask questions with verified citations, and connect external tools.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="p-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="Refresh dashboard stats"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-500' : ''} />
          </button>

          <Link
            to="/workspace/documents"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-primary)] transition-all shadow-2xs hover:border-[var(--border-strong)]"
          >
            <UploadCloud size={14} className="text-blue-500" />
            <span>Upload Documents</span>
          </Link>

          <Link
            to="/workspace/retrieval"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-primary)] transition-all shadow-2xs hover:border-[var(--border-strong)]"
          >
            <SlidersHorizontal size={14} className="text-purple-500" />
            <span>Search Studio</span>
          </Link>

          <Link
            to="/workspace/chat"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all hover:shadow-sm"
          >
            <MessageSquare size={14} />
            <span>New Chat</span>
            <ArrowRight size={13} className="ml-0.5" />
          </Link>
        </div>
      </div>

      {/* ── 2. Telemetry & Metrics Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documents */}
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Database size={13} className="text-blue-500" />
              Documents
            </span>
            <span className="text-[10.5px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Indexed
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
            {loading ? '—' : stats.totalDocs}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] truncate">
            PDF, Markdown, TXT, CSV, Excel
          </p>
        </div>

        {/* Semantic Chunks */}
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Layers size={13} className="text-sky-500" />
              Document Chunks
            </span>
            <span className="text-[10.5px] font-medium text-sky-500 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              Indexed
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
            {loading ? '—' : stats.totalChunks.toLocaleString()}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] truncate">
            Passages indexed for search
          </p>
        </div>

        {/* Total Tokens */}
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Hash size={13} className="text-violet-500" />
              Total Tokens
            </span>
            <span className="text-[10.5px] font-medium text-violet-500 bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-500/20">
              Tokens
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
            {loading ? '—' : stats.totalTokens.toLocaleString()}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] truncate">
            Across all uploaded documents
          </p>
        </div>

        {/* Profiles & Engine Status */}
        <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <SlidersHorizontal size={13} className="text-amber-500" />
              Search Modes
            </span>
            <span className="text-[10.5px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Hybrid Search
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tabular-nums">
            {loading ? '—' : profilesCount}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] truncate">
            Balanced, Deep, and Exact
          </p>
        </div>
      </div>

      {/* ── 3. Core Engine Architecture Pillars ── */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            How It Works
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            Core capabilities
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Pillar 1: Hybrid Retrieval */}
          <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between shadow-2xs group">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
                  <Cpu size={20} />
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Active
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] group-hover:text-blue-500 transition-colors">
                  Hybrid Search
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Combines keyword search and semantic vector search with cross-encoder reranking for accurate matches.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Keyword Search
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Vector Search
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Reranker
                </span>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-muted)] font-medium">
                Diagnostics
              </span>
              <Link
                to="/workspace/retrieval"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors"
              >
                <span>Open Studio</span>
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>

          {/* Pillar 2: Chat & Citations */}
          <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between shadow-2xs group">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Active
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] group-hover:text-purple-500 transition-colors">
                  Chat with Citations
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Answers questions from your documents, automatically rewrites unclear queries, and cites exact sources inline.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Query Rewriter
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Live Streaming
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Source Citations
                </span>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-muted)] font-medium">
                Direct Chat
              </span>
              <Link
                to="/workspace/chat"
                className="inline-flex items-center gap-1 text-xs font-semibold text-purple-500 hover:text-purple-600 transition-colors"
              >
                <span>Open Chat</span>
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>

          {/* Pillar 3: Model Context Protocol (MCP) */}
          <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between shadow-2xs group">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                  <Bot size={20} />
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <Radio size={11} className="animate-pulse" />
                  MCP Server Ready
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] group-hover:text-emerald-500 transition-colors">
                  External Tools (MCP)
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Lets external tools like Claude Desktop or Cursor search your workspace documents directly over standard MCP.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Standard MCP
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Tools API
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[var(--text-secondary)]">
                  Claude &amp; Cursor
                </span>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-muted)] font-medium">
                Integrations
              </span>
              <button
                onClick={handleCopyMcp}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 hover:text-emerald-600 transition-colors cursor-pointer"
              >
                {copiedMcp ? (
                  <>
                    <Check size={13} />
                    <span>Copied Config!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy MCP Config</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Lower Two-Column Section: Documents + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Recent Documents (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-blue-500" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Recent Documents
              </h2>
            </div>
            <Link
              to="/workspace/documents"
              className="text-xs font-medium text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              <span>View all ({stats.totalDocs})</span>
              <ChevronRight size={13} />
            </Link>
          </div>

          {documents.length === 0 ? (
            <div className="p-10 text-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-3">
              <UploadCloud size={30} className="mx-auto text-[var(--text-muted)]" />
              <p className="text-xs text-[var(--text-secondary)]">
                No documents indexed yet in this workspace.
              </p>
              <Link
                to="/workspace/documents"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                <UploadCloud size={13} />
                <span>Upload First Document</span>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface-hover)] -mx-2 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
                      {getFileIcon(doc.file_type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate" title={doc.filename}>
                        {doc.filename}
                      </p>
                      <div className="flex items-center gap-2 text-[10.5px] text-[var(--text-muted)] mt-0.5">
                        <span className="uppercase font-mono font-semibold">{doc.file_type}</span>
                        <span>•</span>
                        <span>{formatBytes(doc.file_size_bytes)}</span>
                        <span>•</span>
                        <span>{doc.chunk_count} chunks</span>
                        <span>•</span>
                        <span>{timeAgo(doc.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                        doc.status === 'ready'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : doc.status === 'failed'
                          ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          : 'bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse'
                      }`}
                    >
                      {doc.status}
                    </span>
                    <Link
                      to="/workspace/documents"
                      className="p-1 rounded-md text-[var(--text-muted)] hover:text-blue-500 hover:bg-[var(--bg-canvas)] transition-colors"
                      title="Inspect in Document Hub"
                    >
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Recent Sessions & MCP Integration (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Recent Conversations */}
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-purple-500" />
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  Recent Chat Threads
                </h2>
              </div>
              <Link
                to="/workspace/chat"
                className="text-xs font-medium text-purple-500 hover:text-purple-600 flex items-center gap-0.5"
              >
                <span>New Session</span>
                <ChevronRight size={13} />
              </Link>
            </div>

            {recentSessions.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-default)] space-y-2">
                <p className="text-xs text-[var(--text-secondary)]">
                  No previous conversation sessions found.
                </p>
                <Link
                  to="/workspace/chat"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-500 font-semibold hover:underline"
                >
                  Start your first research query →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSessions.map((session) => (
                  <Link
                    key={session.id}
                    to="/workspace/chat"
                    className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-purple-500/40 hover:bg-[var(--bg-surface-hover)] transition-all group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate group-hover:text-purple-500 transition-colors">
                        {session.title || 'Untitled Conversation'}
                      </p>
                      <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                        <Clock size={10} />
                        <span>{timeAgo(session.updatedAt || session.createdAt)}</span>
                        <span>•</span>
                        <span>{session.messages?.length || 0} messages</span>
                      </p>
                    </div>
                    <ArrowRight size={13} className="text-[var(--text-muted)] group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* MCP Client Integration Snippet */}
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-500" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  MCP Client Integration
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCopyMcp}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
              >
                {copiedMcp ? (
                  <>
                    <Check size={12} className="text-emerald-500" />
                    <span className="text-emerald-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
              Add HiVE to your Claude Desktop (<code className="text-xs font-mono text-blue-500">claude_desktop_config.json</code>) or Cursor to query indexed documents from your IDE:
            </p>

            <pre className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-default)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto leading-relaxed select-all">
              {mcpConfigCode}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
