import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Square,
  Sparkles,
  Bot,
  User,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Search,
} from 'lucide-react'
import { tokenStorage } from '../utils/storage'
import { useEventStream } from '../hooks/useEventStream'
import CustomSelect from '../components/CustomSelect'
import StreamingMarkdown from '../components/StreamingMarkdown'

const STORAGE_KEY = 'quickdesk_chat_sessions_v1'

const SUGGESTED_PROMPTS = [
  'What is quantum entanglement according to the Feynman lectures?',
  'Explain the four realms of mechanics and how electrodynamics fits in.',
  'Summarize the core equations and boundary conditions in electrodynamics.',
  'What are the key differences between classical and quantum mechanics?',
]

export default function ChatWorkspace() {
  // Session State
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const [activeSessionId, setActiveSessionId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Document Scope State
  const [documents, setDocuments] = useState([])
  const [selectedDocIds, setSelectedDocIds] = useState([])

  // Input & Composer State
  const [inputPrompt, setInputPrompt] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [activeCitationModal, setActiveCitationModal] = useState(null)

  const textareaRef = useRef(null)
  const messagesEndRef = useRef(null)
  const chatContainerRef = useRef(null)
  const userHasScrolledUp = useRef(false)

  // SSE Hook
  const {
    startStream,
    abortStream,
    isStreaming,
    streamedText,
    status,
    citations,
    error: streamError,
    reset: resetStream,
  } = useEventStream()

  // Save sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    } catch (err) {
      console.warn('Failed to persist chat sessions:', err)
    }
  }, [sessions])

  // Fetch documents for scoping dropdown
  useEffect(() => {
    async function loadDocs() {
      try {
        const token = tokenStorage.getToken()
        const res = await fetch('/api/documents?page=1&page_size=50', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const json = await res.json()
          setDocuments(json.items || json.documents || [])
        }
      } catch (err) {
        console.error('Failed to load documents for chat workspace:', err)
      }
    }
    loadDocs()
  }, [])

  // Initialize or ensure active session
  useEffect(() => {
    if (sessions.length === 0) {
      handleCreateNewChat()
    } else if (!activeSessionId || !sessions.find((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId])

  // Active session object
  const activeSession = sessions.find((s) => s.id === activeSessionId) || {
    id: 'default',
    title: 'New Conversation',
    messages: [],
  }

  // Auto-scroll anchoring
  const scrollToBottom = (behavior = 'smooth') => {
    if (!userHasScrolledUp.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' })
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeSession.messages, streamedText, status])

  const handleScroll = () => {
    if (!chatContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
    userHasScrolledUp.current = !isAtBottom
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }, [inputPrompt])

  // Create new session
  const handleCreateNewChat = () => {
    if (isStreaming) abortStream()
    const newSession = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      messages: [],
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(newSession.id)
    resetStream()
    userHasScrolledUp.current = false
  }

  // Delete session
  const handleDeleteSession = (sessionId, e) => {
    e.stopPropagation()
    if (isStreaming && activeSessionId === sessionId) abortStream()
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId)
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id)
      } else {
        handleCreateNewChat()
      }
    }
  }

  // Send message
  const handleSendMessage = async (promptToSend = null) => {
    const text = (promptToSend || inputPrompt).trim()
    if (!text || isStreaming) return

    setInputPrompt('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    userHasScrolledUp.current = false

    const userMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    // Update session title if it's the first message
    const updatedTitle =
      activeSession.messages.length === 0
        ? text.slice(0, 36) + (text.length > 36 ? '...' : '')
        : activeSession.title

    // Append user message immediately (optimistic UI)
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            title: updatedTitle,
            messages: [...s.messages, userMessage],
          }
        }
        return s
      })
    )

    // Build history for backend multi-turn context
    const previousTurns = activeSession.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // Start SSE stream
    await startStream({
      query: text,
      documentIds: selectedDocIds,
      messages: previousTurns,
      topK: 5,
      windowSize: 1,
      temperature: 0.2,
      onDone: ({ text: fullAssistantText }) => {
        // Save completed assistant message into session
        const assistantMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: fullAssistantText,
          citations: citations,
          timestamp: new Date().toISOString(),
        }

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === activeSessionId) {
              return {
                ...s,
                messages: [...s.messages, assistantMessage],
              }
            }
            return s
          })
        )
      },
      onError: (err) => {
        const errorMsg = {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Generation failed: ${err.message || 'Unknown stream error.'}`,
          isError: true,
          timestamp: new Date().toISOString(),
        }
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === activeSessionId) {
              return { ...s, messages: [...s.messages, errorMsg] }
            }
            return s
          })
        )
      },
    })
  }

  // Handle textarea Enter vs Shift+Enter
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleCopyMessage = (text, msgId) => {
    navigator.clipboard.writeText(text)
    setCopiedMessageId(msgId)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }

  return (
    <div className="flex h-[calc(100vh-65px)] w-full overflow-hidden bg-[var(--bg-canvas)]">
      {/* ── 1. Conversation History Sidebar ────────────────────────────── */}
      <aside
        className={`${
          sidebarOpen ? 'w-64 sm:w-72 border-r' : 'w-0 border-r-0'
        } transition-all duration-300 ease-in-out border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col shrink-0 overflow-hidden z-20`}
      >
        <div className="w-64 sm:w-72 flex flex-col h-full shrink-0">
          {/* Sidebar Header */}
        <div className="p-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <button
            onClick={handleCreateNewChat}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus size={14} />
            <span>New Chat</span>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Document Scope Filter inside Sidebar */}
        <div className="p-3 border-b border-[var(--border-subtle)] space-y-1.5">
          <span className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
            <Layers size={13} className="text-blue-500" />
            <span>Document Scope</span>
          </span>
          <CustomSelect
            isMulti={true}
            value={selectedDocIds}
            onChange={setSelectedDocIds}
            placeholder="All Documents (Global)"
            options={[
              { value: '', label: 'All Documents (Global)' },
              ...documents.map((d) => ({ value: d.id, label: d.filename })),
            ]}
          />
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Conversations ({sessions.length})
          </div>
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId
            return (
              <div
                key={session.id}
                onClick={() => {
                  if (isStreaming) abortStream()
                  setActiveSessionId(session.id)
                  resetStream()
                  userHasScrolledUp.current = false
                }}
                className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <div className="flex items-center gap-2 truncate flex-1">
                  <MessageSquare size={13} className={isActive ? 'text-blue-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'} />
                  <span className="truncate">{session.title || 'New Conversation'}</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  title="Delete chat"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] flex items-center justify-between">
          <span>RAG Chat Engine</span>
          <span className="font-mono text-[10px] text-blue-500 font-bold">SSE v1.0</span>
        </div>
        </div>
      </aside>

      {/* ── 2. Main Chat Area ──────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Chat Header Bar */}
        <header className="h-14 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-10">
          <div className="flex items-center gap-2.5 truncate">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] transition-colors cursor-pointer mr-1"
                title="Open sidebar"
              >
                <PanelLeft size={16} />
              </button>
            )}
            <div className="truncate">
              <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                {activeSession.title}
              </h2>
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1 text-blue-500 font-medium">
                  <Sparkles size={11} />
                  <span>meta/llama-3.2-11b-vision-instruct</span>
                </span>
                <span>•</span>
                <span className="truncate">
                  {selectedDocIds.length === 0
                    ? 'Scope: Global (All Documents)'
                    : `Scope: ${selectedDocIds.length} document${selectedDocIds.length > 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedDocIds.length > 0 && (
              <button
                onClick={() => setSelectedDocIds([])}
                className="text-[10px] font-medium text-blue-500 hover:text-blue-600 cursor-pointer bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20"
              >
                Reset Scope
              </button>
            )}
          </div>
        </header>

        {/* Message Thread Scroll Container */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6"
        >
          {/* Welcome Screen when Conversation is Empty */}
          {activeSession.messages.length === 0 && !isStreaming && (
            <div className="max-w-xl mx-auto py-12 text-center space-y-6 animate-in fade-in zoom-in-95">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center mx-auto shadow-sm">
                <Bot size={24} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  What would you like to explore?
                </h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                  Ask questions across all indexed documents or scope specifically to a technical volume. Responses are grounded with exact citations and token streaming.
                </p>
              </div>

              {/* Starter Prompt Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-left">
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-500/50 hover:bg-blue-500/5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-2xs group flex items-start gap-2.5"
                  >
                    <Search size={13} className="text-blue-500 shrink-0 mt-0.5" />
                    <span className="line-clamp-2 leading-relaxed">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render Completed Messages */}
          {activeSession.messages.map((msg) => {
            const isUser = msg.role === 'user'
            const isCopied = copiedMessageId === msg.id

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'} w-full`}
              >
                {/* Assistant Avatar */}
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                    <Bot size={15} />
                  </div>
                )}

                {/* Message Bubble Container */}
                <div
                  className={`flex flex-col gap-2 ${
                    isUser ? 'items-end max-w-[85%] sm:max-w-[75%]' : 'items-start max-w-full flex-1'
                  }`}
                >
                  <div
                    className={`p-4 rounded-2xl text-xs leading-relaxed transition-colors ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-br-xs shadow-sm font-medium'
                        : msg.isError
                        ? 'bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 rounded-bl-xs'
                        : 'bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] rounded-bl-xs shadow-2xs'
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <StreamingMarkdown content={msg.content} isStreaming={false} />
                    )}
                  </div>

                  {/* Grounding Citations strip if assistant message has citations */}
                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-1">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                        <Layers size={11} /> Sources:
                      </span>
                      {msg.citations.map((cite, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => setActiveCitationModal(cite)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-500/50 hover:bg-blue-500/10 text-[10px] font-mono text-[var(--text-secondary)] hover:text-blue-500 transition-all cursor-pointer"
                        >
                          <FileText size={10} className="text-blue-500" />
                          <span className="truncate max-w-[130px]">{cite.document_title || 'Document'}</span>
                          <span className="text-blue-500 font-bold">#{cite.chunk_index}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Actions Bar (Copy message) */}
                  {!isUser && !msg.isError && (
                    <div className="flex items-center gap-2 pl-1 text-[10px] text-[var(--text-muted)]">
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.content, msg.id)}
                        className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                      >
                        {isCopied ? (
                          <>
                            <Check size={11} className="text-emerald-500" />
                            <span className="text-emerald-500 font-medium">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* User Avatar */}
                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-[var(--border-default)] text-[var(--text-secondary)] flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                    <User size={15} />
                  </div>
                )}
              </div>
            )
          })}

          {/* ── Active Streaming Bubble ──────────────────────────────────── */}
          {isStreaming && (
            <div className="flex gap-3 max-w-3xl mr-auto justify-start w-full animate-in fade-in">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                <Bot size={15} />
              </div>

              <div className="flex flex-col gap-2 flex-1 max-w-full">
                {/* Live Status Phase Indicator */}
                {status && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-500/25 bg-blue-500/5 text-blue-600 dark:text-blue-400 text-xs font-medium w-fit animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>{status.message}</span>
                  </div>
                )}

                {/* Live Streamed Markdown Content */}
                {streamedText && (
                  <div className="p-4 rounded-2xl text-xs leading-relaxed bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] rounded-bl-xs shadow-2xs">
                    <StreamingMarkdown content={streamedText} isStreaming={true} />
                  </div>
                )}

                {/* Live Citations Strip */}
                {citations && citations.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 pl-1">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                      <Layers size={11} /> Found Sources:
                    </span>
                    {citations.map((cite, cIdx) => (
                      <button
                        key={cIdx}
                        type="button"
                        onClick={() => setActiveCitationModal(cite)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-500/50 hover:bg-blue-500/10 text-[10px] font-mono text-[var(--text-secondary)] hover:text-blue-500 transition-all cursor-pointer"
                      >
                        <FileText size={10} className="text-blue-500" />
                        <span className="truncate max-w-[130px]">{cite.document_title || 'Document'}</span>
                        <span className="text-blue-500 font-bold">#{cite.chunk_index}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Anchor for auto-scrolling */}
          <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* ── 3. Chat Input Composer ────────────────────────────────────── */}
        <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-surface)] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendMessage()
            }}
            className="max-w-3xl mx-auto space-y-2"
          >
            {/* Scoped Document Pill if active */}
            {selectedDocIds.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">Scoped to:</span>
                <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20 font-medium">
                  {selectedDocIds.length} document{selectedDocIds.length > 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDocIds([])}
                  className="text-[10px] text-[var(--text-muted)] hover:text-rose-500 cursor-pointer underline ml-1"
                >
                  Clear filter
                </button>
              </div>
            )}

            {/* Input Textarea Container */}
            <div className="relative rounded-2xl border border-[var(--border-default)] bg-[var(--bg-canvas)] focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all shadow-xs overflow-hidden">
              <textarea
                ref={textareaRef}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask questions across your documents... (Shift+Enter for newline)"
                rows={1}
                className="w-full resize-none px-4 py-3 text-xs sm:text-sm bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden leading-relaxed max-h-48"
              />

              {/* Action Buttons Row inside Input Container */}
              <div className="px-3 pb-2.5 flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] hidden sm:inline">
                  Enter to send, Shift+Enter for new line
                </span>

                <div className="flex items-center gap-2 ml-auto">
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={abortStream}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                    >
                      <Square size={12} fill="currentColor" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputPrompt.trim()}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                    >
                      <span>Send</span>
                      <Send size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* ── 4. Citation Excerpt Modal ─────────────────────────────────── */}
        {activeCitationModal && (
          <div
            onClick={() => setActiveCitationModal(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl p-6 space-y-4 animate-in zoom-in-95"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-blue-500" />
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">
                    {activeCitationModal.document_title || 'Document Chunk'}
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-blue-500 font-bold">
                  Chunk #{activeCitationModal.chunk_index}
                </span>
              </div>

              <div className="p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed select-text">
                {activeCitationModal.content}
              </div>

              <div className="flex items-center justify-between pt-1">
                {activeCitationModal.relevance_score !== null && (
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    Relevance Score: {activeCitationModal.relevance_score}
                  </span>
                )}
                <button
                  onClick={() => setActiveCitationModal(null)}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
