import React, { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Search,
  CheckCircle2,
  Clock,
  Terminal,
  FileText,
  Layers,
} from 'lucide-react'

export default function ReasoningTimeline({
  steps = [],
  isLive = false,
  onCitationClick = null,
}) {
  const [isExpanded, setIsExpanded] = useState(isLive)
  const [showRawPayloads, setShowRawPayloads] = useState(false)

  if (!steps || steps.length === 0) {
    if (!isLive) return null
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 animate-pulse">
        <Sparkles size={14} className="animate-spin" />
        <span className="font-medium">Agent is thinking and analyzing query...</span>
      </div>
    )
  }

  // Count thoughts and tool calls
  const thoughtsCount = steps.filter((s) => s.type === 'thought').length
  const toolCallsCount = steps.filter((s) => s.type === 'tool_call').length

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface-elevated)] overflow-hidden transition-all shadow-2xs">
      {/* Header Bar / Toggle Badge */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer text-xs"
      >
        <div className="flex items-center gap-2 font-medium text-[var(--text-secondary)]">
          <div className="w-5 h-5 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Sparkles size={12} className={isLive ? 'animate-pulse' : ''} />
          </div>
          <span className="text-[var(--text-primary)] font-semibold">
            {isLive ? 'Agent Reasoning Live...' : 'Agent Reasoning Steps'}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] font-mono">
            ({toolCallsCount} {toolCallsCount === 1 ? 'tool call' : 'tool calls'})
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <span className="text-[11px] hidden sm:inline">
            {isExpanded ? 'Collapse' : 'Inspect'}
          </span>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* Expanded Step Timeline */}
      {isExpanded && (
        <div className="px-4 pb-3.5 pt-1.5 border-t border-[var(--border-subtle)] space-y-3 animate-in fade-in slide-in-from-top-1 text-xs">
          <div className="flex items-center justify-between pb-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold border-b border-[var(--border-subtle)]/60">
            <span>Execution Trace</span>
            <button
              type="button"
              onClick={() => setShowRawPayloads(!showRawPayloads)}
              className="text-blue-500 hover:text-blue-600 transition-colors cursor-pointer capitalize font-medium flex items-center gap-1"
            >
              <Terminal size={10} />
              <span>{showRawPayloads ? 'Hide Raw Details' : 'Show Raw Details'}</span>
            </button>
          </div>

          <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-[var(--border-subtle)]">
            {steps.map((step, idx) => {
              if (step.type === 'thought') {
                return (
                  <div key={idx} className="relative flex items-start gap-3 pl-1">
                    <div className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500 shrink-0 mt-0.5 z-10 shadow-2xs">
                      <Clock size={11} />
                    </div>
                    <div className="flex-1 min-w-0 bg-[var(--bg-canvas)]/60 border border-[var(--border-subtle)] rounded-xl p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[11px] text-blue-500 uppercase tracking-wide">
                          Thought {step.iteration ? `#${step.iteration}` : ''}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed italic">
                        "{step.thought}"
                      </p>
                    </div>
                  </div>
                )
              }

              if (step.type === 'tool_call') {
                return (
                  <div key={idx} className="relative flex items-start gap-3 pl-1">
                    <div className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 mt-0.5 z-10 shadow-2xs">
                      <Search size={11} />
                    </div>
                    <div className="flex-1 min-w-0 bg-[var(--bg-canvas)]/60 border border-[var(--border-subtle)] rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[11px] text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                            Action
                          </span>
                          <span className="font-mono text-[11px] bg-amber-500/10 px-1.5 py-0.5 rounded text-amber-600 dark:text-amber-400 font-bold">
                            {step.tool}
                          </span>
                        </div>
                      </div>

                      {step.tool_input?.query && (
                        <div className="text-[11.5px] text-[var(--text-primary)] font-medium flex items-center gap-1.5">
                          <span className="text-[var(--text-muted)] text-[11px]">Query:</span>
                          <span className="bg-[var(--bg-surface)] px-2 py-0.5 rounded border border-[var(--border-default)] font-mono text-[11px]">
                            {step.tool_input.query}
                          </span>
                        </div>
                      )}

                      {showRawPayloads && (
                        <pre className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] font-mono text-[10px] text-[var(--text-muted)] overflow-x-auto">
                          {JSON.stringify(step.tool_input, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                )
              }

              if (step.type === 'tool_result') {
                return (
                  <div key={idx} className="relative flex items-start gap-3 pl-1">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0 mt-0.5 z-10 shadow-2xs">
                      <CheckCircle2 size={11} />
                    </div>
                    <div className="flex-1 min-w-0 bg-[var(--bg-canvas)]/60 border border-[var(--border-subtle)] rounded-xl p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[11px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                          Observation
                        </span>
                        {step.citations && step.citations.length > 0 && (
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            {step.citations.length} sources
                          </span>
                        )}
                      </div>

                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                        {step.summary}
                      </p>

                      {step.citations && step.citations.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {step.citations.map((cite, cIdx) => (
                            <button
                              key={cIdx}
                              type="button"
                              onClick={() => onCitationClick && onCitationClick(cite)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-default)] text-[10.5px] text-[var(--text-secondary)] hover:text-blue-500 hover:border-blue-500/40 transition-colors cursor-pointer shadow-2xs"
                            >
                              <FileText size={10} className="text-blue-500" />
                              <span className="truncate max-w-[120px]">{cite.document_title || 'Document'}</span>
                              <span className="font-mono text-[9.5px] text-blue-500 font-bold">#{cite.chunk_index}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              return null
            })}
          </div>
        </div>
      )}
    </div>
  )
}
