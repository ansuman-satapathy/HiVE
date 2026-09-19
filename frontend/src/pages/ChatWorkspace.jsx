import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Square,
  Sparkles,
  User,
  PanelLeftClose,
  PanelLeft,
  FileText,
  Copy,
  Check,
  Layers,
  Search,
  BookOpen,
  X,
  Clock,
  ChevronDown,
  ArrowDown,
  Edit2,
  RefreshCw,
  Download,
} from 'lucide-react'
import { tokenStorage } from '../utils/storage'
import { useEventStream } from '../hooks/useEventStream'
import CustomSelect from '../components/CustomSelect'
import StreamingMarkdown from '../components/StreamingMarkdown'
import { HiveLogoIcon } from '../components/HiveLogo'

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
  const [sessionToDelete, setSessionToDelete] = useState(null)

  // Feature 1: Editing User Message State
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editPromptText, setEditPromptText] = useState('')

  // Feature 3: Inline Renaming State
  const [isRenamingTitle, setIsRenamingTitle] = useState(false)
  const [renamingTitleText, setRenamingTitleText] = useState('')
  const renameInputRef = useRef(null)

  // Feature 4: Scroll State
  const [showScrollBottom, setShowScrollBottom] = useState(false)

  const textareaRef = useRef(null)
  const messagesEndRef = useRef(null)
  const chatContainerRef = useRef(null)
  const userHasScrolledUp = useRef(false)

  // Close modals or cancel edit on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (sessionToDelete) setSessionToDelete(null)
        if (activeCitationModal) setActiveCitationModal(null)
        if (editingMessageId) setEditingMessageId(null)
        if (isRenamingTitle) setIsRenamingTitle(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sessionToDelete, activeCitationModal, editingMessageId, isRenamingTitle])

  // Focus rename input when editing starts
  useEffect(() => {
    if (isRenamingTitle && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenamingTitle])

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

  // Auto-scroll anchoring: directly scroll container so bottom padding is respected
  const scrollToBottom = (behavior = 'auto') => {
    if (!chatContainerRef.current) return
    if (!userHasScrolledUp.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }

  // Force scroll whenever user submits a new turn
  useEffect(() => {
    if (activeSession.messages.length > 0) {
      // If user just sent a message, scroll down once smoothly
      const lastMsg = activeSession.messages[activeSession.messages.length - 1]
      if (lastMsg.role === 'user') {
        userHasScrolledUp.current = false
        setShowScrollBottom(false)
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth',
          })
        }
      }
    }
  }, [activeSession.messages.length])

  // Stream text & status auto-scroll: strictly check userHasScrolledUp.current
  useEffect(() => {
    if (isStreaming && !userHasScrolledUp.current) {
      scrollToBottom('auto')
    }
  }, [streamedText, status, isStreaming])

  // Detect any user intent to scroll up (wheel or touch)
  const handleUserWheel = (e) => {
    if (e.deltaY < 0) {
      // User is scrolling UP: disarm forced auto-scroll
      userHasScrolledUp.current = true
    }
  }

  const handleTouchStart = useRef({ y: 0 })
  const onTouchStart = (e) => {
    if (e.touches.length > 0) {
      handleTouchStart.current.y = e.touches[0].clientY
    }
  }
  const onTouchMove = (e) => {
    if (e.touches.length > 0) {
      const delta = e.touches[0].clientY - handleTouchStart.current.y
      if (delta > 10) {
        // Dragging downwards = scrolling UP: disarm forced auto-scroll
        userHasScrolledUp.current = true
      }
    }
  }

  const handleScroll = () => {
    if (!chatContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const distanceToBottom = scrollHeight - scrollTop - clientHeight

    // Only show pill if content is actually scrolled away / cropped (>220px, beyond the composer island height)
    if (distanceToBottom < 80) {
      userHasScrolledUp.current = false
      setShowScrollBottom(false)
    } else if (distanceToBottom > 220) {
      userHasScrolledUp.current = true
      setShowScrollBottom(true)
    }
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
    // If an empty new conversation already exists, just switch to it
    const existingEmpty = sessions.find((s) => !s.messages || s.messages.length === 0)
    if (existingEmpty) {
      setActiveSessionId(existingEmpty.id)
      resetStream()
      userHasScrolledUp.current = false
      setShowScrollBottom(false)
      setEditingMessageId(null)
      return
    }

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
    setShowScrollBottom(false)
    setEditingMessageId(null)
  }

  // Request delete session (opens confirmation dialog)
  const handleRequestDeleteSession = (session, e) => {
    e.stopPropagation()
    // Do not allow deleting a new conversation with no messages
    if (!session || !session.messages || session.messages.length === 0) {
      return
    }
    setSessionToDelete(session)
  }

  // Confirm delete session after user approval
  const handleConfirmDeleteSession = () => {
    if (!sessionToDelete) return
    const sessionId = sessionToDelete.id
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
    setSessionToDelete(null)
  }

  // ── Core Stream Execution Function ─────────────────────────────────────
  const executeStreamTurn = async (queryText, priorMessages, sessionToUpdateId) => {
    userHasScrolledUp.current = false
    setShowScrollBottom(false)
    setTimeout(() => scrollToBottom('smooth'), 50)

    // Build history for backend multi-turn context
    const previousTurns = priorMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    await startStream({
      query: queryText,
      documentIds: selectedDocIds,
      messages: previousTurns,
      topK: 5,
      windowSize: 1,
      temperature: 0.2,
      onDone: ({ text: fullAssistantText, citations: doneCitations }) => {
        const assistantMessage = {
          id: `msg_asst_${Date.now()}`,
          role: 'assistant',
          content: fullAssistantText,
          citations: doneCitations && doneCitations.length > 0 ? doneCitations : citations,
          timestamp: new Date().toISOString(),
        }

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === sessionToUpdateId) {
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
            if (s.id === sessionToUpdateId) {
              return { ...s, messages: [...s.messages, errorMsg] }
            }
            return s
          })
        )
      },
    })
  }

  // Send message
  const handleSendMessage = async (promptToSend = null) => {
    const text = (promptToSend || inputPrompt).trim()
    if (!text || isStreaming) return

    setInputPrompt('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

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

    // Append user message immediately
    const nextMessages = [...activeSession.messages, userMessage]
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            title: updatedTitle,
            messages: nextMessages,
          }
        }
        return s
      })
    )

    await executeStreamTurn(text, activeSession.messages, activeSessionId)
  }

  // ── Feature 1: Edit & Re-run ──────────────────────────────────────────
  const handleStartEditMessage = (msg) => {
    if (isStreaming) abortStream()
    setEditingMessageId(msg.id)
    setEditPromptText(msg.content)
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditPromptText('')
  }

  const handleConfirmEditAndRerun = async (msgId) => {
    const text = editPromptText.trim()
    if (!text || isStreaming) return

    const msgIndex = activeSession.messages.findIndex((m) => m.id === msgId)
    if (msgIndex === -1) return

    // Truncate everything after this message (branching from this turn)
    const priorTurns = activeSession.messages.slice(0, msgIndex)
    const editedUserMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: [...priorTurns, editedUserMessage],
          }
        }
        return s
      })
    )

    setEditingMessageId(null)
    setEditPromptText('')
    await executeStreamTurn(text, priorTurns, activeSessionId)
  }

  // ── Feature 2: Regenerate Response ────────────────────────────────────
  const handleRegenerateLastResponse = async () => {
    if (isStreaming || activeSession.messages.length === 0) return

    // Find the last assistant message and the preceding user query
    const msgs = [...activeSession.messages]
    const lastMsg = msgs[msgs.length - 1]

    let priorTurns = []
    let queryToRerun = ''

    if (lastMsg.role === 'assistant') {
      // Pop the assistant message
      const withoutLastAssistant = msgs.slice(0, -1)
      const lastUserMsg = withoutLastAssistant[withoutLastAssistant.length - 1]
      if (!lastUserMsg || lastUserMsg.role !== 'user') return

      queryToRerun = lastUserMsg.content
      priorTurns = withoutLastAssistant.slice(0, -1)

      // Update state without the old assistant message
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === activeSessionId) {
            return { ...s, messages: withoutLastAssistant }
          }
          return s
        })
      )
    } else if (lastMsg.role === 'user') {
      queryToRerun = lastMsg.content
      priorTurns = msgs.slice(0, -1)
    }

    if (queryToRerun) {
      await executeStreamTurn(queryToRerun, priorTurns, activeSessionId)
    }
  }

  // ── Feature 3: Inline Renaming ─────────────────────────────────────────
  const handleStartRename = () => {
    setRenamingTitleText(activeSession.title)
    setIsRenamingTitle(true)
  }

  const handleSaveRename = () => {
    const trimmed = renamingTitleText.trim()
    if (trimmed && trimmed !== activeSession.title) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, title: trimmed } : s))
      )
    }
    setIsRenamingTitle(false)
  }

  // ── Feature 5: Export Conversation to Markdown ─────────────────────────
  const handleExportMarkdown = () => {
    if (!activeSession || activeSession.messages.length === 0) return

    let md = `# ${activeSession.title || 'QuickDesk Conversation'}\n`
    md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`

    activeSession.messages.forEach((msg) => {
      const roleName = msg.role === 'user' ? '### 👤 User' : '### ✨ Assistant'
      md += `${roleName}\n\n${msg.content}\n\n`

      if (msg.citations && msg.citations.length > 0) {
        md += `**Sources Cited:**\n`
        msg.citations.forEach((c) => {
          md += `- **${c.document_title || 'Document'}** (Chunk #${c.chunk_index})\n`
          if (c.content) {
            md += `  > ${c.content.replace(/\n/g, ' ')}\n`
          }
        })
        md += `\n`
      }
      md += `---\n\n`
    })

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(activeSession.title || 'chat').replace(/[^a-zA-Z0-9_-]/g, '_')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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

  const hasMessages = activeSession.messages.length > 0 || isStreaming

  return (
    <div className="flex h-[calc(100vh-65px)] w-full overflow-hidden bg-[var(--bg-canvas)]">
      {/* ── 1. Serene Conversation Sidebar ──────────────────────────────── */}
      <aside
        className={`${
          sidebarOpen ? 'w-64 sm:w-72 border-r' : 'w-0 border-r-0'
        } transition-all duration-300 ease-in-out border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col shrink-0 overflow-hidden z-20`}
      >
        <div className="w-64 sm:w-72 flex flex-col h-full shrink-0">
          {/* Sidebar Header - exactly h-13 to align seamlessly with main header */}
          <div className="h-13 px-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
            <button
              onClick={handleCreateNewChat}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-blue-500/40 hover:bg-blue-500/5 text-[var(--text-primary)] text-xs font-semibold shadow-2xs transition-all cursor-pointer group"
            >
              <Plus size={14} className="text-blue-500 group-hover:rotate-90 transition-transform duration-200" />
              <span>New Conversation</span>
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
              title="Close sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* Scope Selector in Sidebar */}
          <div className="p-3.5 border-b border-[var(--border-subtle)] space-y-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
              <Layers size={13} className="text-blue-500" />
              <span>Filter Documents</span>
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

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Clock size={11} />
              <span>Recent Conversations</span>
            </div>

            {sessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--text-muted)] space-y-1">
                <p>No conversations yet.</p>
                <p className="text-[11px]">Click New Conversation to start.</p>
              </div>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === activeSessionId
                const messageCount = session.messages ? session.messages.length : 0
                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      if (isStreaming) abortStream()
                      setActiveSessionId(session.id)
                      resetStream()
                      userHasScrolledUp.current = false
                      setShowScrollBottom(false)
                      setEditingMessageId(null)
                    }}
                    className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[var(--bg-surface-hover)] text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20 shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1">
                      <MessageSquare
                        size={13}
                        className={isActive ? 'text-blue-500 shrink-0' : 'text-[var(--text-muted)] shrink-0'}
                      />
                      <span className="truncate">{session.title || 'New Conversation'}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {messageCount > 0 && (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] opacity-60 group-hover:opacity-0 transition-opacity">
                          {messageCount}
                        </span>
                      )}
                      {session.messages && session.messages.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => handleRequestDeleteSession(session, e)}
                          title="Delete conversation"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Quick Stats & Document Library Footprint */}
          <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-1.5 font-medium">
                <FileText size={12} className="text-blue-500" />
                <span>Knowledge Base</span>
              </span>
              <span className="font-mono text-[10px] font-semibold text-[var(--text-primary)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-default)]">
                {documents.length} {documents.length === 1 ? 'doc' : 'docs'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[10.5px] text-[var(--text-muted)] pt-0.5">
              <span>{sessions.length} {sessions.length === 1 ? 'conversation' : 'conversations'}</span>
              <span className="text-blue-500/80 font-medium">Llama-3.2 RAG</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 2. Editorial Central Chat Column ────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Minimalist Header Bar */}
        <header className="h-13 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0 z-10">
          <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
            {!sidebarOpen && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-1.5 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] transition-colors cursor-pointer"
                  title="Open sidebar"
                >
                  <PanelLeft size={16} />
                </button>
                <button
                  onClick={handleCreateNewChat}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-blue-500/40 hover:bg-blue-500/5 text-[var(--text-primary)] text-xs font-semibold shadow-2xs transition-all cursor-pointer group"
                  title="Start a new conversation"
                >
                  <Plus size={13} className="text-blue-500 group-hover:rotate-90 transition-transform duration-200" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </div>
            )}

            {/* Feature 3: Inline Renaming in Header */}
            <div className="truncate flex items-center gap-2 max-w-lg">
              {isRenamingTitle ? (
                <div className="flex items-center gap-1.5 w-full">
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renamingTitleText}
                    onChange={(e) => setRenamingTitleText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename()
                      if (e.key === 'Escape') setIsRenamingTitle(false)
                    }}
                    onBlur={handleSaveRename}
                    className="px-2 py-1 text-xs sm:text-sm font-semibold text-[var(--text-primary)] bg-[var(--bg-canvas)] border border-blue-500/50 rounded-lg focus:outline-hidden ring-2 ring-blue-500/20 w-full"
                  />
                  <button
                    onClick={handleSaveRename}
                    className="p-1 text-blue-500 hover:text-blue-600 cursor-pointer"
                    title="Save title"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={handleStartRename}
                  className="group flex items-center gap-2 cursor-pointer rounded-lg px-1.5 py-0.5 hover:bg-[var(--bg-surface-hover)] transition-colors"
                  title="Click to rename thread"
                >
                  <h2 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
                    {activeSession.title}
                  </h2>
                  <Edit2
                    size={12}
                    className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-xs">
            {/* Feature 5: Export Thread to Markdown */}
            {activeSession.messages.length > 0 && (
              <button
                onClick={handleExportMarkdown}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-2xs"
                title="Export conversation to Markdown (.md)"
              >
                <Download size={12} className="text-blue-500" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-default)] text-[11px] text-[var(--text-secondary)]">
              <Sparkles size={11} className="text-blue-500" />
              <span className="hidden sm:inline">Model:</span>
              <span className="font-mono text-[10px] text-[var(--text-primary)] font-medium">llama-3.2-11b</span>
            </span>
          </div>
        </header>

        {/* Scrollable Conversation Stream */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          onWheel={handleUserWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          className="flex-1 overflow-y-auto px-4 sm:px-6 pb-56 pt-6"
        >
          <div className="max-w-3xl mx-auto space-y-8">
            {/* ── Welcome State (When No Messages) ────────────────────────── */}
            {!hasMessages && (
              <div className="py-16 sm:py-24 text-center space-y-8 animate-in fade-in zoom-in-95">
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center mx-auto shadow-xs">
                    <BookOpen size={24} />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                    What would you like to know?
                  </h1>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
                    Ask questions across your entire document repository. All answers are synthesized with verified citations and live streaming.
                  </p>
                </div>

                {/* Inspiration Prompt Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      className="p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-500/40 hover:bg-blue-500/[0.03] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-2xs group flex items-start gap-3"
                    >
                      <Search size={14} className="text-blue-500 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                      <span className="line-clamp-2 leading-relaxed font-medium">{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Message History Stream ─────────────────────────────────── */}
            {activeSession.messages.map((msg, index) => {
              const isUser = msg.role === 'user'
              const isCopied = copiedMessageId === msg.id
              const isLastTurn = index === activeSession.messages.length - 1

              if (isUser) {
                const isEditing = editingMessageId === msg.id

                return (
                  <div key={msg.id} className="flex justify-end w-full group animate-in fade-in">
                    {isEditing ? (
                      /* Feature 1: Inline User Message Editor */
                      <div className="w-full max-w-2xl rounded-2xl p-3.5 bg-[var(--bg-surface)] border border-blue-500/40 shadow-md space-y-2.5">
                        <textarea
                          value={editPromptText}
                          onChange={(e) => setEditPromptText(e.target.value)}
                          className="w-full p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-default)] text-xs sm:text-[13px] text-[var(--text-primary)] focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 leading-relaxed resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-[var(--text-muted)]">
                            Submitting will branch a new stream from this question
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="px-3 py-1 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs text-[var(--text-secondary)] cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmEditAndRerun(msg.id)}
                              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs cursor-pointer transition-all"
                            >
                              Save & Re-run
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Standard User Message Pill */
                      <div className="flex items-center gap-2 max-w-[85%] sm:max-w-[75%]">
                        {/* Edit Prompt Pencil Button (hover) */}
                        <button
                          type="button"
                          onClick={() => handleStartEditMessage(msg)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-all cursor-pointer"
                          title="Edit and re-run query"
                        >
                          <Edit2 size={13} />
                        </button>

                        <div className="rounded-2xl rounded-tr-xs px-4 py-2.5 bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] shadow-xs">
                          <p className="text-[14px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap select-text font-normal">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              }

              // Assistant Message: Open Editorial Flow
              return (
                <div key={msg.id} className="flex gap-3.5 sm:gap-4 w-full group animate-in fade-in">
                  {/* HiVE Brand Assistant Avatar */}
                  <div className="w-7 h-7 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs overflow-hidden">
                    <HiveLogoIcon size={18} />
                  </div>

                  {/* Open Reading Column */}
                  <div className="flex-1 min-w-0 space-y-3">
                    {msg.isError ? (
                      <div className="p-3.5 rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-medium">
                        {msg.content}
                      </div>
                    ) : (
                      <StreamingMarkdown content={msg.content} isStreaming={false} />
                    )}

                    {/* Citations Grounding Strip */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1 mr-1">
                          <Layers size={12} /> Sources:
                        </span>
                        {msg.citations.map((cite, cIdx) => (
                          <button
                            key={cIdx}
                            type="button"
                            onClick={() => setActiveCitationModal(cite)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-500/50 hover:bg-blue-500/5 text-[11px] text-[var(--text-secondary)] hover:text-blue-500 transition-all cursor-pointer shadow-2xs"
                          >
                            <FileText size={11} className="text-blue-500" />
                            <span className="truncate max-w-[140px] font-medium">{cite.document_title || 'Document'}</span>
                            <span className="font-mono text-[10px] text-blue-500 font-bold">#{cite.chunk_index}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-[var(--text-muted)]">
                      {!msg.isError && (
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.content, msg.id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer text-[11px]"
                        >
                          {isCopied ? (
                            <>
                              <Check size={11} className="text-emerald-500" />
                              <span className="text-emerald-500 font-medium">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={11} />
                              <span>Copy response</span>
                            </>
                          )}
                        </button>
                      )}

                      {/* Feature 2: Regenerate / Retry Button on the latest turn */}
                      {isLastTurn && !isStreaming && (
                        <button
                          type="button"
                          onClick={handleRegenerateLastResponse}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-blue-500 transition-colors cursor-pointer text-[11px]"
                          title="Regenerate this response"
                        >
                          <RefreshCw size={11} />
                          <span>Regenerate</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* ── Active Streaming Turn ──────────────────────────────────── */}
            {isStreaming && (
              <div className="flex gap-3.5 sm:gap-4 w-full animate-in fade-in">
                <div className="w-7 h-7 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs overflow-hidden">
                  <HiveLogoIcon size={18} className="animate-pulse" />
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                  {/* Status Indicator Pill */}
                  {status && (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/25 bg-blue-500/5 text-blue-600 dark:text-blue-400 text-xs font-medium w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      <span>{status.message}</span>
                    </div>
                  )}

                  {/* Streaming Markdown Content */}
                  {streamedText && (
                    <StreamingMarkdown content={streamedText} isStreaming={true} />
                  )}

                  {/* Citations Found Live */}
                  {citations && citations.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1 mr-1">
                        <Layers size={12} /> Found Sources:
                      </span>
                      {citations.map((cite, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => setActiveCitationModal(cite)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-500/50 hover:bg-blue-500/5 text-[11px] text-[var(--text-secondary)] hover:text-blue-500 transition-all cursor-pointer shadow-2xs"
                        >
                          <FileText size={11} className="text-blue-500" />
                          <span className="truncate max-w-[140px] font-medium">{cite.document_title || 'Document'}</span>
                          <span className="font-mono text-[10px] text-blue-500 font-bold">#{cite.chunk_index}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-16" />
          </div>
        </div>

        {/* ── Feature 4: Floating "Scroll to Bottom" Pill ──────────────── */}
        {showScrollBottom && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-2">
            <button
              onClick={() => {
                userHasScrolledUp.current = false
                setShowScrollBottom(false)
                scrollToBottom('smooth')
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-default)] hover:border-blue-500/40 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium shadow-md hover:shadow-lg transition-all cursor-pointer backdrop-blur-md"
            >
              <ArrowDown size={13} className="text-blue-500 animate-bounce" />
              <span>Scroll to bottom</span>
            </button>
          </div>
        )}

        {/* ── 3. Floating Input Island ──────────────────────────────────── */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none pb-3 pt-10 bg-gradient-to-t from-[var(--bg-canvas)] via-[var(--bg-canvas)]/95 to-transparent flex flex-col items-center justify-end px-4 z-20">
          <div className="pointer-events-auto max-w-3xl w-full space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
              className="w-full rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg hover:border-blue-500/30 transition-all duration-200 focus-within:border-blue-500/70 focus-within:shadow-xl focus-within:ring-3 focus-within:ring-blue-500/10 overflow-hidden"
            >
              {/* Input Textarea */}
              <textarea
                ref={textareaRef}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your documents... (Shift+Enter for newline)"
                rows={1}
                className="w-full resize-none px-4 pt-3.5 pb-2 text-[14px] leading-relaxed bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden max-h-48"
              />

              {/* Bottom Toolbar inside the Island */}
              <div className="px-3.5 pb-2.5 pt-1.5 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]/60 bg-[var(--bg-canvas)]/30">
                <div className="flex items-center gap-2 truncate">
                  {/* Active Scope Pill */}
                  {selectedDocIds.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-600 dark:text-blue-400 font-medium shadow-2xs">
                      <FileText size={11} />
                      <span className="truncate max-w-[150px]">
                        {selectedDocIds.length === 1
                          ? documents.find((d) => d.id === selectedDocIds[0])?.filename || '1 document'
                          : `${selectedDocIds.length} documents`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedDocIds([])}
                        className="hover:text-rose-500 cursor-pointer p-0.5 rounded-full"
                        title="Remove filter"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--text-muted)] hidden sm:flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60" />
                      <span>Scoped to all indexed repository documents</span>
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={abortStream}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer animate-pulse"
                    >
                      <Square size={11} fill="currentColor" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputPrompt.trim()}
                      className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all cursor-pointer ${
                        inputPrompt.trim()
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs scale-100'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] opacity-40 cursor-not-allowed scale-95'
                      }`}
                      title="Send message (Enter)"
                    >
                      <Send size={13} className={inputPrompt.trim() ? 'translate-x-0.5 -translate-y-0.5' : ''} />
                    </button>
                  )}
                </div>
              </div>
            </form>

            {/* AI Accuracy Disclaimer Notice */}
            <div className="text-center">
              <p className="text-[11px] text-[var(--text-muted)] leading-normal select-none">
                HiVE synthesizes answers from document context. AI may make mistakes; always verify critical information via citations.
              </p>
            </div>
          </div>
        </div>

        {/* ── 4. Excerpt Preview Modal ──────────────────────────────────── */}
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
                  <h4 className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[280px]">
                    {activeCitationModal.document_title || 'Document Excerpt'}
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-blue-500 font-bold">
                  Chunk #{activeCitationModal.chunk_index}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed select-text">
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

        {/* ── 5. Delete Confirmation Modal ──────────────────────────────── */}
        {sessionToDelete && (
          <div
            onClick={() => setSessionToDelete(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Trash2 size={18} />
                </div>
                <div className="space-y-1 min-w-0">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Delete conversation?
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Are you sure you want to delete <span className="font-semibold text-[var(--text-primary)] break-all">"{sessionToDelete.title}"</span>? This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setSessionToDelete(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSession}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
