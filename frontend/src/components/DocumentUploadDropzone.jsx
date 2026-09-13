import { UploadCloud, Loader2, FileUp, Clock } from 'lucide-react'

export default function DocumentUploadDropzone({
  uploading,
  hasActiveDocs,
  activeCount = 0,
  dragOver,
  setDragOver,
  onFileSelect,
  fileInputRef,
  onOpenDrawer
}) {
  const isLocked = uploading || hasActiveDocs

  return (
    <div className="relative group">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!isLocked) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (isLocked) return
          if (e.dataTransfer.files?.length) onFileSelect(Array.from(e.dataTransfer.files))
        }}
        onClick={() => {
          if (!isLocked) fileInputRef.current?.click()
        }}
        className={`relative overflow-hidden rounded-2xl border border-dashed transition-all duration-200 py-3 px-4 sm:py-3.5 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 ${
          isLocked
            ? 'cursor-not-allowed border-amber-500/30 bg-amber-500/[0.02] shadow-xs'
            : dragOver
            ? 'cursor-pointer border-blue-500 bg-blue-500/15 scale-[1.006] shadow-md shadow-blue-500/20 ring-1 ring-blue-500/30'
            : 'cursor-pointer border-blue-500/30 hover:border-blue-500/70 bg-[var(--bg-surface)] hover:bg-blue-500/[0.04] shadow-xs hover:shadow-md hover:shadow-blue-500/10 hover:scale-[1.002]'
        }`}
      >
        {/* Glow ambient background effect */}
        <div className={`absolute inset-0 bg-gradient-to-r pointer-events-none transition-opacity duration-200 ${
          isLocked
            ? 'from-amber-500/5 via-transparent to-transparent opacity-80'
            : uploading
            ? 'from-blue-500/25 via-blue-500/10 to-transparent opacity-100'
            : dragOver
            ? 'from-blue-500/20 via-blue-500/5 to-transparent opacity-100'
            : 'from-blue-500/10 via-blue-500/5 to-transparent opacity-70 group-hover:opacity-100 group-hover:from-blue-500/15'
        }`} />

        {/* Top edge animated progress line while uploading or ingesting */}
        {uploading && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500/20 overflow-hidden">
            <div className="h-full bg-blue-500 w-1/3 rounded-full shimmer-progress animate-pulse" />
          </div>
        )}
        {!uploading && hasActiveDocs && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500/20 overflow-hidden">
            <div className="h-full bg-amber-500/70 w-1/4 rounded-full shimmer-progress animate-pulse" />
          </div>
        )}

        {/* Left: Icon & Description */}
        <div className="relative z-10 flex items-center gap-3 text-center sm:text-left min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all shadow-xs ${
            uploading
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/40'
              : hasActiveDocs
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400'
              : 'bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-400 group-hover:scale-105 group-hover:border-blue-500/60'
          }`}>
            {uploading ? (
              <Loader2 size={20} className="spin-animate" />
            ) : hasActiveDocs ? (
              <Clock size={19} className="animate-spin-slow" />
            ) : (
              <UploadCloud size={20} />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] leading-tight truncate">
                {uploading
                  ? 'Uploading files to workspace...'
                  : hasActiveDocs
                  ? 'Ingestion in progress...'
                  : 'Drop files here or click to browse'}
              </h3>
              {uploading && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse">
                  uploading
                </span>
              )}
              {!uploading && hasActiveDocs && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  processing {activeCount > 0 ? `(${activeCount})` : ''}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5 truncate">
              {uploading ? (
                'Transferring payload to server. Ingestion pipeline will begin automatically.'
              ) : hasActiveDocs ? (
                <>
                  <span>Current documents are parsing and indexing.</span>
                  <span className="text-[var(--text-muted)] ml-1">New uploads are locked until processing finishes.</span>
                </>
              ) : (
                <>
                  <span>Upload PDF, Markdown, TXT, DOCX, CSV, Excel (.xlsx)</span>
                  <span className="text-[var(--text-muted)]"> • Max 10 files, 50MB each</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Right: Action Trigger */}
        <div className="relative z-10 shrink-0">
          <div className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all select-none ${
            isLocked
              ? 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-default)] cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white group-hover:shadow-sm cursor-pointer'
          }`}>
            {uploading ? (
              <>
                <Loader2 size={13} className="spin-animate" />
                <span>Uploading...</span>
              </>
            ) : hasActiveDocs ? (
              <>
                <Clock size={13} />
                <span>Locked (Processing)</span>
              </>
            ) : (
              <>
                <FileUp size={13} />
                <span>Select Files</span>
              </>
            )}
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          multiple
          disabled={isLocked}
          className="hidden"
          accept=".pdf,.md,.txt,.docx,.doc,.csv,.xlsx,.xls"
          onChange={(e) => {
            if (!isLocked && e.target.files?.length) onFileSelect(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
