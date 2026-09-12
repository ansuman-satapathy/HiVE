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
        className={`relative overflow-hidden cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 p-7 sm:p-9 text-center flex flex-col items-center justify-center ${
          dragOver
            ? 'border-blue-500 bg-blue-500/10 scale-[1.008]'
            : 'border-[var(--border-default)] hover:border-blue-500/60 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] shadow-sm hover:shadow-md'
        }`}
      >
        {/* Glow ambient background effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="relative z-10 flex flex-col items-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
            {uploading ? (
              <Loader2 size={26} className="spin-animate" />
            ) : (
              <UploadCloud size={26} />
            )}
          </div>

          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
            {uploading ? 'Processing & Ingesting File...' : 'Click or drag and drop files here to upload'}
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-4">
            Upload PDF manuals, Markdown guides (.md), or raw TXT documents
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm group-hover:shadow transition-all">
            <FileUp size={15} />
            <span>Select File From Computer</span>
          </div>

          <div className="flex items-center gap-3 mt-4 text-[11px] text-[var(--text-muted)]">
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-default)] font-mono">PDF</span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-default)] font-mono">MARKDOWN</span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-default)] font-mono">TXT</span>
            <span>• Max 50MB</span>
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
