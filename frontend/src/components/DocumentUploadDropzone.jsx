import { UploadCloud, Loader2, FileUp } from 'lucide-react'

export default function DocumentUploadDropzone({
  uploading,
  dragOver,
  setDragOver,
  onFileSelect,
  fileInputRef
}) {
  return (
    <div className="relative group">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files?.length) onFileSelect(Array.from(e.dataTransfer.files))
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative overflow-hidden cursor-pointer rounded-2xl border border-dashed transition-all duration-200 py-3 px-4 sm:py-3.5 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 ${
          dragOver
            ? 'border-blue-500 bg-blue-500/15 scale-[1.006] shadow-md shadow-blue-500/20 ring-1 ring-blue-500/30'
            : 'border-blue-500/30 hover:border-blue-500/70 bg-[var(--bg-surface)] hover:bg-blue-500/[0.04] shadow-xs hover:shadow-md hover:shadow-blue-500/10 hover:scale-[1.002]'
        }`}
      >
        {/* Glow ambient background effect (visible by default, amplified on hover) */}
        <div className={`absolute inset-0 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent pointer-events-none transition-opacity duration-200 ${
          dragOver ? 'opacity-100 from-blue-500/20' : 'opacity-70 group-hover:opacity-100 group-hover:from-blue-500/15'
        }`} />

        {/* Left: Icon & Description */}
        <div className="relative z-10 flex items-center gap-3 text-center sm:text-left min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:border-blue-500/60 transition-all shadow-xs">
            {uploading ? (
              <Loader2 size={18} className="spin-animate" />
            ) : (
              <UploadCloud size={18} />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] leading-tight truncate">
              {uploading ? 'Uploading files to workspace...' : 'Drop files here or click to browse'}
            </h3>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5 truncate">
              {uploading
                ? 'Sending payload to server. Ingestion will begin immediately...'
                : 'Upload PDF, Markdown, TXT, DOCX, CSV, Excel (.xlsx)'} <span className="text-[var(--text-muted)]">• Max 10 files, 50MB each</span>
            </p>
          </div>
        </div>

        {/* Right: Action Trigger */}
        <div className="relative z-10 shrink-0">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs group-hover:shadow-sm transition-all select-none">
            <FileUp size={13} />
            <span>Select Files</span>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          multiple
          className="hidden"
          accept=".pdf,.md,.txt,.docx,.doc,.csv,.xlsx,.xls"
          onChange={(e) => {
            if (e.target.files?.length) onFileSelect(Array.from(e.target.files))
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
