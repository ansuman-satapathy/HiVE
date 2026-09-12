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
      return <span className="badge badge-success">ready</span>
    case 'failed':
      return <span className="badge badge-danger">failed</span>
    case 'parsing':
      return <span className="badge badge-info"><Loader2 size={10} className="spin-animate" style={{ marginRight: 4 }} />parsing</span>
    case 'chunking':
      return <span className="badge badge-primary"><Loader2 size={10} className="spin-animate" style={{ marginRight: 4 }} />chunking</span>
    case 'indexing':
      return <span className="badge badge-warning"><Loader2 size={10} className="spin-animate" style={{ marginRight: 4 }} />indexing</span>
    default:
      return <span className="badge badge-mono">{status}</span>
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-default)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Background Processing
            </h2>
            {activeTasks.length > 0 && (
              <span className="badge badge-primary" style={{ fontSize: '11px' }}>
                {activeTasks.length} active
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onRefresh}
              className="btn btn-ghost btn-sm"
              title="Refresh queue"
              style={{ padding: '6px' }}
            >
              <RefreshCw size={15} />
            </button>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm"
              style={{ padding: '6px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Active Tasks Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Active Queue ({activeTasks.length})
              </span>
            </div>

            {activeTasks.length === 0 ? (
              <div style={{
                padding: '24px 16px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-default)',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}>
                No documents currently processing.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeTasks.map((task) => {
                  const progress = getStageProgress(task.status)
                  return (
                    <div
                      key={task.id}
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-default)',
                        backgroundColor: 'var(--bg-surface)',
                        boxShadow: 'var(--shadow-xs)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div style={{
                            padding: '6px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--primary-subtle)',
                            color: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                          }}>
                            <FileText size={16} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              margin: 0,
                            }}>
                              {task.filename}
                            </p>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {(task.file_size_bytes / 1024).toFixed(1)} KB • {task.file_type.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        {getStatusBadge(task.status)}
                      </div>

                      {/* Animated Progress Bar */}
                      <div style={{
                        width: '100%',
                        height: '6px',
                        backgroundColor: 'var(--border-subtle)',
                        borderRadius: 'var(--radius-full)',
                        overflow: 'hidden',
                        marginBottom: '10px',
                      }}>
                        <div style={{
                          width: `${progress}%`,
                          height: '100%',
                          backgroundColor: 'var(--primary)',
                          borderRadius: 'var(--radius-full)',
                          transition: 'width 0.4s ease',
                        }} />
                      </div>

                      {/* Step Indicator Flow */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span style={{ color: task.status === 'parsing' ? 'var(--primary)' : 'inherit', fontWeight: task.status === 'parsing' ? 600 : 400 }}>
                          1. Parsing
                        </span>
                        <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ color: task.status === 'chunking' ? 'var(--primary)' : 'inherit', fontWeight: task.status === 'chunking' ? 600 : 400 }}>
                          2. Chunking
                        </span>
                        <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ color: task.status === 'ready' ? 'var(--success)' : 'inherit' }}>
                          3. Ready
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Completed Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                Recent Ingestion Jobs ({recentCompleted.length})
              </span>
            </div>

            {recentCompleted.length === 0 ? (
              <div style={{
                padding: '20px 16px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
                fontSize: '13px',
              }}>
                No completed jobs recorded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentCompleted.map((job) => (
                  <div
                    key={job.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      {job.status === 'ready' ? (
                        <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                      ) : (
                        <AlertCircle size={16} style={{ color: 'var(--error)', flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <p style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          margin: 0,
                        }}>
                          {job.filename}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>{job.chunk_count} chunks</span>
                          <span>•</span>
                          <span>{job.token_count} tokens</span>
                          <span>•</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Clock size={10} />
                            {job.elapsed_seconds}s
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      {getStatusBadge(job.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          <span>Async Workers: Active</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
            Polling interval: 2.5s
          </span>
        </div>
      </div>
    </div>
  )
}
