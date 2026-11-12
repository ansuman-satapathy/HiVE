import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import CitationBadge from './CitationBadge'
import { highlightCode } from '../utils/highlighter'

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

  // Parse inline elements (code, bold, italic, bold+italic, citations, links)
  const renderInline = (text) => {
    if (!text) return null

    // Comprehensive regex for inline formatting tokens
    const tokenRegex = /(`[^`\n]+`|\[doc:\s*[^\]]+\]|\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[^*\n]+?\*|_[^_\n]+?_|\[[^\]]+\]\([^)]+\))/g

    const parts = text.split(tokenRegex)

    return parts.map((part, i) => {
      if (!part) return null

      // Inline code: `code`
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded-md bg-[var(--bg-subtle)] text-blue-600 dark:text-blue-400 font-mono text-[12px] border border-[var(--border-default)]"
          >
            {part.slice(1, -1)}
          </code>
        )
      }

      // Citation tag: [doc:CHUNK_ID]
      const docMatch = part.match(/^\[doc:\s*([^\]]+)\]$/)
      if (docMatch) {
        const rawId = docMatch[1].trim()
        const normalizedId = rawId.toLowerCase()

        // 1. Match chunk_id exactly or case-insensitive
        // 2. Match chunk_index
        // 3. Match 1-based index (e.g. [doc:1])
        // 4. Match document_id
        // 5. Match partial title
        let foundIdx = citations.findIndex(
          (c) =>
            String(c.chunk_id || '').toLowerCase().trim() === normalizedId ||
            String(c.chunk_index) === rawId ||
            String(c.document_id || '').toLowerCase().trim() === normalizedId
        )

        if (foundIdx === -1 && /^\d+$/.test(rawId)) {
          const num = parseInt(rawId, 10)
          if (num >= 1 && num <= citations.length) {
            foundIdx = num - 1
          }
        }

        if (foundIdx === -1 && citations.length > 0) {
          foundIdx = citations.findIndex(
            (c) => c.document_title && c.document_title.toLowerCase().includes(normalizedId)
          )
        }

        const citeData = foundIdx !== -1 ? citations[foundIdx] : null
        const displayNum =
          foundIdx !== -1
            ? foundIdx + 1
            : /^\d+$/.test(rawId)
              ? rawId
              : citations.length === 1
                ? 1
                : null

        return (
          <CitationBadge
            key={i}
            citation={citeData}
            chunkId={rawId}
            index={displayNum !== null ? displayNum : '•'}
            onClick={onCitationClick}
          />
        )
      }

      // Bold + Italic: ***text***
      if (part.startsWith('***') && part.endsWith('***') && part.length > 6) {
        return (
          <strong key={i} className="font-semibold text-[var(--text-primary)]">
            <em className="italic">{part.slice(3, -3)}</em>
          </strong>
        )
      }

      // Bold: **text**
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={i} className="font-semibold text-[var(--text-primary)]">
            {part.slice(2, -2)}
          </strong>
        )
      }

      // Italic: *text* or _text_
      if (
        ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) &&
        part.length > 2
      ) {
        return (
          <em key={i} className="italic text-[var(--text-secondary)]">
            {part.slice(1, -1)}
          </em>
        )
      }

      // Markdown Link: [text](url)
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        return (
          <a
            key={i}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 underline font-medium"
          >
            {linkMatch[1]}
          </a>
        )
      }

      return part
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
              <code
                className={`language-${block.language || 'text'}`}
                dangerouslySetInnerHTML={{ __html: highlightCode(block.code, block.language) }}
              />
            </pre>
          </div>
        )
      }

      // Parse markdown text into paragraphs and blocks
      // We group by double newlines or list/heading transitions so normal paragraphs flow naturally
      const rawParagraphs = block.text.split(/\n{2,}/)
      const isLastBlock = bIdx === blocks.length - 1

      return (
        <div key={bIdx} className="space-y-3.5">
          {rawParagraphs.map((para, pIdx) => {
            const isLastPara = isLastBlock && pIdx === rawParagraphs.length - 1
            const trimmed = para.trim()
            if (!trimmed) return null

            // If the paragraph contains multiple lines (e.g. lists or soft breaks)
            const lines = para.split('\n')

            // Single Heading: #, ##, ###
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={pIdx} className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight pt-2 pb-0.5">
                  {renderInline(trimmed.slice(4))}
                  {isStreaming && isLastPara && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                  )}
                </h4>
              )
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h3 key={pIdx} className="text-[16.5px] font-bold text-[var(--text-primary)] tracking-tight pt-2.5 pb-1">
                  {renderInline(trimmed.slice(3))}
                  {isStreaming && isLastPara && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                  )}
                </h3>
              )
            }
            if (trimmed.startsWith('# ')) {
              return (
                <h2 key={pIdx} className="text-lg font-bold text-[var(--text-primary)] tracking-tight pt-3 pb-1">
                  {renderInline(trimmed.slice(2))}
                  {isStreaming && isLastPara && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                  )}
                </h2>
              )
            }

            // Blockquotes
            if (trimmed.startsWith('> ')) {
              return (
                <blockquote
                  key={pIdx}
                  className="pl-3.5 py-1 my-1.5 border-l-2 border-blue-500/60 bg-blue-500/[0.04] rounded-r-lg text-[13.5px] text-[var(--text-secondary)] italic leading-relaxed"
                >
                  {renderInline(trimmed.slice(2))}
                  {isStreaming && isLastPara && (
                    <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                  )}
                </blockquote>
              )
            }

            // Tables: check if lines form a markdown table
            const isTable =
              lines.length >= 2 &&
              lines.every((l) => {
                const t = l.trim()
                return t.startsWith('|') && t.endsWith('|')
              })

            if (isTable) {
              const rows = lines.map((l) =>
                l
                  .trim()
                  .slice(1, -1)
                  .split('|')
                  .map((c) => c.trim())
              )
              const hasSeparator = rows.length > 1 && rows[1].every((c) => /^:?-+:?$/.test(c))
              const headerRow = hasSeparator ? rows[0] : null
              const bodyRows = hasSeparator ? rows.slice(2) : rows

              return (
                <div key={pIdx} className="my-3 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)]">
                  <table className="w-full text-left text-xs border-collapse">
                    {headerRow && (
                      <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border-default)]">
                        <tr>
                          {headerRow.map((cell, cIdx) => (
                            <th key={cIdx} className="px-3.5 py-2 font-semibold text-[var(--text-primary)]">
                              {renderInline(cell)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                    )}
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {bodyRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3.5 py-2 text-[var(--text-secondary)]">
                              {renderInline(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }

            // If the paragraph is a collection of list items or contains list items
            const isListBlock = lines.some((l) => {
              const t = l.trim()
              return t.startsWith('- ') || t.startsWith('* ') || /^\d+\.\s+/.test(t)
            })

            if (isListBlock) {
              return (
                <div key={pIdx} className="space-y-1.5 my-1">
                  {lines.map((line, lIdx) => {
                    const isLastLine = isLastPara && lIdx === lines.length - 1
                    const t = line.trim()
                    if (!t) return null

                    if (t.startsWith('- ') || t.startsWith('* ')) {
                      return (
                        <div key={lIdx} className="flex items-start gap-2.5 pl-1 text-[14px]">
                          <span className="text-blue-500 select-none leading-[1.65] text-base">•</span>
                          <span className="flex-1 leading-[1.65] text-[var(--text-primary)]">
                            {renderInline(t.slice(2))}
                            {isStreaming && isLastLine && (
                              <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                            )}
                          </span>
                        </div>
                      )
                    }

                    const numMatch = t.match(/^(\d+)\.\s+(.*)/)
                    if (numMatch) {
                      return (
                        <div key={lIdx} className="flex items-start gap-2.5 pl-1 text-[14px]">
                          <span className="font-mono text-[11.5px] font-semibold text-blue-500 select-none leading-[1.65] pt-0.5">
                            {numMatch[1]}.
                          </span>
                          <span className="flex-1 leading-[1.65] text-[var(--text-primary)]">
                            {renderInline(numMatch[2])}
                            {isStreaming && isLastLine && (
                              <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                            )}
                          </span>
                        </div>
                      )
                    }

                    return (
                      <p key={lIdx} className="text-[14px] leading-relaxed text-[var(--text-primary)]">
                        {renderInline(line)}
                        {isStreaming && isLastLine && (
                          <span className="inline-block w-1.5 h-3.5 ml-1.5 bg-blue-500 rounded-xs animate-pulse opacity-80 align-middle" />
                        )}
                      </p>
                    )
                  })}
                </div>
              )
            }

            // Normal cohesive paragraph: join soft breaks with space or line break
            return (
              <p key={pIdx} className="text-[14px] leading-[1.7] text-[var(--text-primary)]">
                {lines.map((line, lIdx) => (
                  <React.Fragment key={lIdx}>
                    {renderInline(line)}
                    {lIdx < lines.length - 1 && ' '}
                  </React.Fragment>
                ))}
                {isStreaming && isLastPara && (
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
