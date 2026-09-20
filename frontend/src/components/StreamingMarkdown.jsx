import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import CitationBadge from './CitationBadge'

/**
 * Editorial-grade streaming markdown and code block renderer.
 * Designed with Claude-inspired typography, open reading rhythm, and zero external dependencies.
 * Supports interactive [doc:chunk_id] inline citation badges.
 */
export default function StreamingMarkdown({
  content = '',
  isStreaming = false,
  className = '',
  citations = [],
  onCitationClick = null,
}) {
  const [copiedCodeId, setCopiedCodeId] = useState(null)

  const handleCopyCode = (codeText, id) => {
    navigator.clipboard.writeText(codeText)
    setCopiedCodeId(id)
    setTimeout(() => {
      setCopiedCodeId(null)
    }, 2000)
  }

  // Parse inline elements (bold, italic, code, citation badges)
  const renderInline = (text) => {
    if (!text) return null

    // Split by inline code first
    const parts = text.split(/(`[^`]+`)/g)

    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded-md bg-[var(--bg-subtle)] text-blue-600 dark:text-blue-400 font-mono text-[12px] border border-[var(--border-default)]"
          >
            {part.slice(1, -1)}
          </code>
        )
      }

      // Handle bold **text**
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g)
      return boldParts.map((bPart, j) => {
        if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
          return (
            <strong key={`${i}-${j}`} className="font-semibold text-[var(--text-primary)]">
              {bPart.slice(2, -2)}
            </strong>
          )
        }

        // Handle italic *text*
        const italicParts = bPart.split(/(\*[^*]+\*)/g)
        return italicParts.map((iPart, k) => {
          if (iPart.startsWith('*') && iPart.endsWith('*') && iPart.length > 2) {
            return (
              <em key={`${i}-${j}-${k}`} className="italic text-[var(--text-secondary)]">
                {iPart.slice(1, -1)}
              </em>
            )
          }

          // Handle [doc:chunk_id] inline citation tags
          const citeParts = iPart.split(/(\[doc:[a-zA-Z0-9_\-]+\])/g)
          return citeParts.map((cPart, cIdx) => {
            const match = cPart.match(/^\[doc:([a-zA-Z0-9_\-]+)\]$/)
            if (match) {
              const chunkId = match[1]
              // Find matching citation from citations array
              const foundIdx = citations.findIndex(
                (c) => String(c.chunk_id) === String(chunkId) || String(c.chunk_index) === String(chunkId)
              )
              const citeData = foundIdx !== -1 ? citations[foundIdx] : null
              const displayNum = foundIdx !== -1 ? foundIdx + 1 : cIdx + 1

              return (
                <CitationBadge
                  key={`${i}-${j}-${k}-${cIdx}`}
                  citation={citeData}
                  chunkId={chunkId}
                  index={displayNum}
                  onClick={onCitationClick}
                />
              )
            }
            return cPart
          })
        })
      })
    })
  }

  // Parse blocks
  const renderBlocks = () => {
    if (!content) return null

    // Separate fenced code blocks
    const codeBlockRegex = /```([a-zA-Z0-9_\-]*)\n([\s\S]*?)(?:```|$)/g
    const blocks = []
    let lastIndex = 0
    let match

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        blocks.push({
          type: 'markdown',
          text: content.slice(lastIndex, match.index),
        })
      }
      blocks.push({
        type: 'code',
        language: match[1] || 'text',
        code: match[2].trimEnd(),
        id: `code-${match.index}`,
      })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      blocks.push({
        type: 'markdown',
        text: content.slice(lastIndex),
      })
    }

    return blocks.map((block, bIdx) => {
      if (block.type === 'code') {
        const isCopied = copiedCodeId === block.id
        return (
          <div
            key={bIdx}
            className="my-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] overflow-hidden shadow-xs"
          >
            {/* Code Block Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[11px] text-[var(--text-muted)]">
              <span className="font-mono uppercase font-semibold text-[10px] tracking-wider text-[var(--text-secondary)]">
                {block.language || 'code'}
              </span>
              <button
                type="button"
                onClick={() => handleCopyCode(block.code, block.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer text-[11px]"
              >
                {isCopied ? (
                  <>
                    <Check size={12} className="text-emerald-500" />
                    <span className="text-emerald-500 font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            {/* Code Content */}
            <pre className="p-4 text-[12.5px] font-mono overflow-x-auto leading-relaxed text-[var(--text-primary)] select-text">
              <code>{block.code}</code>
            </pre>
          </div>
        )
      }

      // Render markdown paragraph lines
      const lines = block.text.split('\n')
      const isLastBlock = bIdx === blocks.length - 1

      return (
        <div key={bIdx} className="space-y-3">
          {lines.map((line, lIdx) => {
            const isLastLine = isLastBlock && lIdx === lines.length - 1
            const trimmed = line.trim()
            if (!trimmed) {
              return <div key={lIdx} className="h-2" />
            }

            // Headings
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={lIdx} className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight mt-5 mb-2">
                  {renderInline(trimmed.slice(4))}
                  {isStreaming && isLastLine && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                  )}
                </h4>
              )
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h3 key={lIdx} className="text-lg font-bold text-[var(--text-primary)] tracking-tight mt-6 mb-2.5">
                  {renderInline(trimmed.slice(3))}
                  {isStreaming && isLastLine && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                  )}
                </h3>
              )
            }
            if (trimmed.startsWith('# ')) {
              return (
                <h2 key={lIdx} className="text-xl font-bold text-[var(--text-primary)] tracking-tight mt-7 mb-3">
                  {renderInline(trimmed.slice(2))}
                  {isStreaming && isLastLine && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                  )}
                </h2>
              )
            }

            // Blockquotes
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote
                  key={lIdx}
                  className="pl-4 py-1.5 my-2.5 border-l-2 border-blue-500/60 bg-blue-500/[0.04] rounded-r-lg text-[13.5px] text-[var(--text-secondary)] italic leading-relaxed"
                >
                  {renderInline(trimmed.slice(2))}
                  {isStreaming && isLastLine && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                  )}
                </blockquote>
              )
            }

            // Bullet Lists
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <div key={lIdx} className="flex items-start gap-2.5 pl-1 my-1 text-[14px]">
                  <span className="text-blue-500 select-none leading-[1.7] text-base">•</span>
                  <span className="flex-1 leading-[1.7] text-[var(--text-primary)]">
                    {renderInline(trimmed.slice(2))}
                    {isStreaming && isLastLine && (
                      <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                    )}
                  </span>
                </div>
              )
            }

            // Numbered Lists
            const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
            if (numMatch) {
              return (
                <div key={lIdx} className="flex items-start gap-2.5 pl-1 my-1 text-[14px]">
                  <span className="font-mono text-[12px] font-semibold text-blue-500 select-none leading-[1.7] pt-0.5">
                    {numMatch[1]}.
                  </span>
                  <span className="flex-1 leading-[1.7] text-[var(--text-primary)]">
                    {renderInline(numMatch[2])}
                    {isStreaming && isLastLine && (
                      <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                    )}
                  </span>
                </div>
              )
            }

            // Standard Paragraph
            return (
              <p key={lIdx} className="text-[14.5px] leading-[1.75] text-[var(--text-primary)]">
                {renderInline(line)}
                {isStreaming && isLastLine && (
                  <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                )}
              </p>
            )
          })}
        </div>
      )
    })
  }

  return (
    <div className={`streaming-markdown ${className}`}>
      {renderBlocks()}
    </div>
  )
}
