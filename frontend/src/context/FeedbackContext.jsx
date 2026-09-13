import { createContext, useContext, useState, useCallback, useId } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  Trash2,
} from 'lucide-react'

const FeedbackContext = createContext(null)

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmModal, setConfirmModal] = useState(null)

  // Toast dispatch
  const showToast = useCallback(({ type = 'info', title, message, duration = 4000 }) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const newToast = { id, type, title, message }
    setToasts((prev) => [...prev, newToast])

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Convenience toast methods
  const notify = {
    success: (message, title = 'Success') => showToast({ type: 'success', title, message }),
    error: (message, title = 'Error') => showToast({ type: 'error', title, message, duration: 6000 }),
    warning: (message, title = 'Warning') => showToast({ type: 'warning', title, message }),
    info: (message, title = 'Info') => showToast({ type: 'info', title, message }),
  }

  // Confirmation Modal dispatch (returns a Promise<boolean>)
  const confirm = useCallback(
    ({
      title = 'Confirm Action',
      message = 'Are you sure you want to proceed?',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      variant = 'danger', // 'danger' | 'warning' | 'primary'
    }) => {
      return new Promise((resolve) => {
        setConfirmModal({
          title,
          message,
          confirmText,
          cancelText,
          variant,
          onConfirm: () => {
            setConfirmModal(null)
            resolve(true)
          },
          onCancel: () => {
            setConfirmModal(null)
            resolve(false)
          },
        })
      })
    },
    []
  )

  return (
    <FeedbackContext.Provider value={{ notify, confirm, showToast, removeToast }}>
      {children}

      {/* Floating Toast Stack */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-2 fade-in duration-200 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/30 text-rose-100'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/30 text-amber-100'
                : 'bg-slate-900/90 border-slate-700/60 text-slate-100'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {toast.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle size={18} className="text-rose-400" />}
              {toast.type === 'warning' && <AlertTriangle size={18} className="text-amber-400" />}
              {toast.type === 'info' && <Info size={18} className="text-blue-400" />}
            </div>

            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className="text-xs font-bold leading-tight mb-0.5 tracking-tight">{toast.title}</p>
              )}
              <p className="text-xs leading-relaxed opacity-90">{toast.message}</p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Modal Confirmation Dialog */}
      {confirmModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-2xl animate-in zoom-in-95 duration-150 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmModal.variant === 'danger'
                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    : confirmModal.variant === 'warning'
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                }`}
              >
                {confirmModal.variant === 'danger' ? (
                  <Trash2 size={20} />
                ) : confirmModal.variant === 'warning' ? (
                  <AlertTriangle size={20} />
                ) : (
                  <Info size={20} />
                )}
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                  {confirmModal.title}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-default)]">
              <button
                type="button"
                onClick={confirmModal.onCancel}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-default)] transition-all"
              >
                {confirmModal.cancelText}
              </button>

              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-sm ${
                  confirmModal.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                    : confirmModal.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                }`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const context = useContext(FeedbackContext)
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider')
  }
  return context
}
