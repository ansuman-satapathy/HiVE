import React from 'react'
import { Trash2 } from 'lucide-react'

export default function DeleteSessionModal({
  session,
  onClose,
  onConfirm,
}) {
  if (!session) return null

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0 mt-0.5">
            <Trash2 size={18} />
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Delete conversation?
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-[var(--text-primary)] break-all">"{session.title}"</span>? This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
