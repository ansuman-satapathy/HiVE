import { useEffect } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, Clock, FileText, RefreshCw, ChevronRight } from 'lucide-react'

function getStageProgress(status) {
  switch (status) {
    case 'pending': return 15
    case 'parsing': return 40
    case 'chunking': return 75
    case 'indexing': return 90
    case 'ready': return 100
    case 'failed': return 100
    default: return 0
  }
}

function getStatusBadge(status) {
  switch (status) {
    case 'ready':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">ready</span>
    case 'failed':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/25">failed</span>
    case 'parsing':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-500 border border-sky-500/25 gap-1"><Loader2 size={10} className="spin-animate" />parsing</span>
    case 'chunking':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/25 gap-1"><Loader2 size={10} className="spin-animate" />chunking</span>
    case 'indexing':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/25 gap-1"><Loader2 size={10} className="spin-animate" />indexing</span>
    default:
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-default)]">{status}</span>
  }
}

export default function TaskQueueDrawer({ isOpen, onClose, queueData, onRefresh }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const activeTasks = queueData?.active_tasks || []
  const recentCompleted = queueData?.recent_completed || []

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Background Tasks
            </h2>
            {activeTasks.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/25">
                {activeTasks.length} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Refresh queue"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Close drawer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-[var(--bg-canvas)]">
          {/* Active Tasks Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                In Progress ({activeTasks.length})
              </span>
            </div>

            {activeTasks.length === 0 ? (
              <div className="p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-center text-xs text-[var(--text-muted)]">
                No files currently being parsed
              </div>
            ) : (
              <div className="space-y-3">
                {activeTasks.map((task) => {
                  const progress = getStageProgress(task.status)
                  return (
                    <div
                      key={task.id}
                      className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm space-y-3 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {task.filename}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {(task.file_size_bytes / 1024).toFixed(1)} KB • {task.file_type?.toUpperCase()}
                          </p>
                        </div>
                        {getStatusBadge(task.status)}
                      </div>

                      {/* Animated Progress Track */}
                      <div className="w-full bg-[var(--bg-subtle)] border border-[var(--border-default)] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300 shimmer-progress"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {task.elapsed_seconds ? `${task.elapsed_seconds.toFixed(1)}s` : 'Active'}
                        </span>
                        <span>{progress}% complete</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Completed Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Recent ({recentCompleted.length})
              </span>
            </div>

            {recentCompleted.length === 0 ? (
              <div className="p-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-center text-xs text-[var(--text-muted)]">
                No completed ingestion jobs yet
              </div>
            ) : (
              <div className="space-y-2">
                {recentCompleted.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[var(--text-primary)] truncate">
                        {task.filename}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {task.chunk_count || 0} sections • {task.token_count || 0} tokens
                      </p>
                    </div>
                    {getStatusBadge(task.status)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
