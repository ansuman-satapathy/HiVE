import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * High-performance streaming markdown and code block renderer with zero external dependencies.
 * Formats headings, lists, blockquotes, inline tags, and fenced code blocks with 1-click copy.
 */
export default function StreamingMarkdown({ content = '', isStreaming = false, className = '' }) {
  const [copiedCodeId, setCopiedCodeId] = useState(null)

  const handleCopyCode = (codeText, id) => {
    navigator.clipboard.writeText(codeText)
    setCopiedCodeId(id)
    setTimeout(() => {
      setCopiedCodeId(null)
    }, 2000)
  }

  // Parse inline elements (bold, italic, code, link)
  const renderInline = (text) => {
    if (!text) return null

    // Split by inline code first
    const parts = text.split(/(`[^`]+`)/g)

    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[11px] border border-blue-500/20"
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
          return iPart
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
            className="my-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] overflow-hidden shadow-xs"
          >
            {/* Code Block Header */}
            <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-muted)]">
              <span className="font-mono uppercase font-semibold text-[10px] tracking-wider text-[var(--text-secondary)]">
                {block.language || 'code'}
              </span>
              <button
                type="button"
                onClick={() => handleCopyCode(block.code, block.id)}
                className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer text-[11px]"
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
            <pre className="p-3.5 text-xs font-mono overflow-x-auto leading-relaxed text-[var(--text-primary)] select-text">
              <code>{block.code}</code>
            </pre>
          </div>
        )
      }

      // Render markdown paragraph lines
      const lines = block.text.split('\n')
      return (
        <div key={bIdx} className="space-y-2">
          {lines.map((line, lIdx) => {
            const trimmed = line.trim()
            if (!trimmed) {
              return <div key={lIdx} className="h-2" />
            }

            // Headings
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={lIdx} className="text-xs font-bold text-[var(--text-primary)] mt-3 mb-1">
                  {renderInline(trimmed.slice(4))}
                </h4>
              )
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h3 key={lIdx} className="text-sm font-bold text-[var(--text-primary)] mt-3.5 mb-1.5">
                  {renderInline(trimmed.slice(3))}
                </h3>
              )
            }
            if (trimmed.startsWith('# ')) {
              return (
                <h2 key={lIdx} className="text-base font-bold text-[var(--text-primary)] mt-4 mb-2">
                  {renderInline(trimmed.slice(2))}
                </h2>
              )
            }

            // Blockquotes
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote
                  key={lIdx}
                  className="pl-3 py-1 my-1 border-l-2 border-blue-500/60 bg-blue-500/5 rounded-r text-[11px] text-[var(--text-secondary)] italic"
                >
                  {renderInline(trimmed.slice(2))}
                </blockquote>
              )
            }

            // Bullet Lists
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-2 my-0.5 text-xs">
                  <span className="text-blue-500 font-bold select-none leading-relaxed">•</span>
                  <span className="flex-1 leading-relaxed">{renderInline(trimmed.slice(2))}</span>
                </div>
              )
            }

            // Numbered Lists
            const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
            if (numMatch) {
              return (
                <div key={lIdx} className="flex items-start gap-2 pl-2 my-0.5 text-xs">
                  <span className="font-mono text-[11px] font-semibold text-blue-500 select-none leading-relaxed">
                    {numMatch[1]}.
                  </span>
                  <span className="flex-1 leading-relaxed">{renderInline(numMatch[2])}</span>
                </div>
              )
            }

            // Standard Paragraph
            return (
              <p key={lIdx} className="text-xs leading-relaxed text-[var(--text-primary)]">
                {renderInline(line)}
              </p>
            )
          })}
        </div>
      )
    })
  }

  return (
    <div className={`streaming-markdown leading-relaxed ${className}`}>
      {renderBlocks()}
      {isStreaming && (
        <span className="inline-block w-1.5 h-3.5 ml-1 bg-blue-500 animate-pulse align-middle rounded-xs" />
      )}
    </div>
  )
}
