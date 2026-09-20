import React from 'react'
import {
  MessageSquare,
  Plus,
  Trash2,
  Clock,
  Check,
  Edit2,
  FileText,
} from 'lucide-react'

export default function ChatSidebar({
  isOpen,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateNewChat,
  onStartRename,
  onSaveRename,
  editingSessionTitleId,
  renamingTitleText,
  setRenamingTitleText,
  renameInputRef,
  onCancelRename,
  onRequestDeleteSession,
  documentsCount,
}) {
  return (
    <aside
      className={`${
        isOpen ? 'w-64 border-r' : 'w-0 border-r-0'
      } transition-all duration-300 ease-in-out border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col shrink-0 overflow-hidden z-20`}
    >
      <div className="w-64 flex flex-col h-full shrink-0">
        {/* Sidebar Header - exactly h-13 to align seamlessly with main header */}
        <div className="h-13 px-4 border-b border-[var(--border-subtle)] flex items-center shrink-0">
          <button
            onClick={onCreateNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-blue-500/40 hover:bg-blue-500/5 text-[var(--text-primary)] text-xs font-semibold shadow-2xs transition-all cursor-pointer group"
          >
            <Plus size={14} className="text-blue-500 group-hover:rotate-90 transition-transform duration-200" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <Clock size={11} />
            <span>Recent Conversations</span>
          </div>

          {sessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-[var(--text-muted)] space-y-1">
              <p>No conversations yet.</p>
              <p className="text-[11px]">Click New Conversation to start.</p>
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId
              const messageCount = session.messages ? session.messages.length : 0
              const isEditingThisTitle = editingSessionTitleId === session.id

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    if (isEditingThisTitle) return
                    onSelectSession(session.id)
                  }}
                  className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    <MessageSquare
                      size={13}
                      className={isActive ? 'text-blue-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'}
                    />
                    {isEditingThisTitle ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renamingTitleText}
                          onChange={(e) => setRenamingTitleText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveRename(session.id)
                            if (e.key === 'Escape') onCancelRename()
                          }}
                          onBlur={() => onSaveRename(session.id)}
                          className="w-full px-1.5 py-0.5 text-xs font-normal text-[var(--text-primary)] bg-[var(--bg-canvas)] border border-blue-500/60 rounded-md focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => onSaveRename(session.id)}
                          className="p-0.5 text-blue-500 hover:text-blue-600 cursor-pointer shrink-0"
                          title="Save"
                        >
                          <Check size={13} />
                        </button>
                      </div>
                    ) : (
                      <span className="truncate">{session.title || 'New Conversation'}</span>
                    )}
                  </div>

                  {!isEditingThisTitle && (
                    <div className="flex items-center gap-1 shrink-0">
                      {messageCount > 0 && (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] opacity-60 group-hover:opacity-0 transition-opacity">
                          {messageCount}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => onStartRename(session, e)}
                        title="Rename conversation"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition-all cursor-pointer shrink-0"
                      >
                        <Edit2 size={12} />
                      </button>
                      {session.messages && session.messages.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => onRequestDeleteSession(session, e)}
                          title="Delete conversation"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Quick Stats & Document Library Footprint */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5 font-medium">
              <FileText size={12} className="text-blue-500" />
              <span>Knowledge Base</span>
            </span>
            <span className="font-mono text-[10px] font-semibold text-[var(--text-primary)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">
              {documentsCount} {documentsCount === 1 ? 'doc' : 'docs'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10.5px] text-[var(--text-muted)] pt-0.5">
            <span>{sessions.length} {sessions.length === 1 ? 'conversation' : 'conversations'}</span>
            <span className="flex items-center gap-1 text-emerald-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              <span>Ready</span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
