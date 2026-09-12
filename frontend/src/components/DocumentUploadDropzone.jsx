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
          if (e.dataTransfer.files?.[0]) onFileSelect(e.dataTransfer.files[0])
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative overflow-hidden cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 py-4 px-5 sm:py-4.5 sm:px-7 flex flex-col sm:flex-row items-center justify-between gap-4 ${
          dragOver
            ? 'border-blue-500 bg-blue-500/10 scale-[1.004]'
            : 'border-[var(--border-default)] hover:border-blue-500/60 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] shadow-xs hover:shadow-sm'
        }`}
      >
        {/* Glow ambient background effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Left: Icon & Description */}
        <div className="relative z-10 flex items-center gap-3.5 text-center sm:text-left">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            {uploading ? (
              <Loader2 size={19} className="spin-animate" />
            ) : (
              <UploadCloud size={19} />
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] leading-tight">
              {uploading ? 'Processing & Ingesting File...' : 'Drop files here or click to browse'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Upload PDF manuals, Markdown (.md), or raw TXT <span className="text-[var(--text-muted)]">• Max 50MB</span>
            </p>
          </div>
        </div>

        {/* Right: File tags & Trigger Button */}
        <div className="relative z-10 flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-default)] font-mono">PDF</span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-default)] font-mono">MD</span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-default)] font-mono">TXT</span>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs group-hover:shadow transition-all select-none">
            <FileUp size={14} />
            <span>Select File</span>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.md,.txt"
          onChange={(e) => {
            if (e.target.files?.[0]) onFileSelect(e.target.files[0])
          }}
        />
      </div>
    </div>
  )
}
