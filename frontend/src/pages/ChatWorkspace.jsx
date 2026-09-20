import React, { useState, useEffect, useRef } from 'react'
import {
  PanelLeftClose,
  PanelLeft,
  Plus,
  BookOpen,
  Search,
  Download,
} from 'lucide-react'
import { tokenStorage } from '../utils/storage'
import { useEventStream } from '../hooks/useEventStream'
import CustomSelect from '../components/CustomSelect'
import StreamingMarkdown from '../components/StreamingMarkdown'
import CitationSourceDrawer from '../components/CitationSourceDrawer'
import { HiveLogoIcon } from '../components/HiveLogo'

// Modular chat subcomponents
import ChatSidebar from '../components/chat/ChatSidebar'
import ChatMessageItem from '../components/chat/ChatMessageItem'
import ChatComposer from '../components/chat/ChatComposer'
import DeleteSessionModal from '../components/chat/DeleteSessionModal'

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

  // Retrieval Profiles State
  const [profiles, setProfiles] = useState([])
  const [selectedProfileId, setSelectedProfileId] = useState(null)

  // Document Scope State
  const [documents, setDocuments] = useState([])
  const [selectedDocIds, setSelectedDocIds] = useState([])

  // Input & Composer State
  const [inputPrompt, setInputPrompt] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [selectedCitation, setSelectedCitation] = useState(null)
  const [sessionToDelete, setSessionToDelete] = useState(null)

  // Feature 1: Editing User Message State
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editPromptText, setEditPromptText] = useState('')

  // Inline Renaming State (in sidebar list)
  const [editingSessionTitleId, setEditingSessionTitleId] = useState(null)
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
        if (selectedCitation) setSelectedCitation(null)
        if (editingMessageId) setEditingMessageId(null)
        if (editingSessionTitleId) setEditingSessionTitleId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sessionToDelete, selectedCitation, editingMessageId, editingSessionTitleId])

  // Focus rename input when editing starts
  useEffect(() => {
    if (editingSessionTitleId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [editingSessionTitleId])

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

  // Fetch retrieval profiles
  useEffect(() => {
    async function loadProfiles() {
      try {
        const token = tokenStorage.getToken()
        const res = await fetch('/api/retrieval-profiles', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const list = await res.json()
          setProfiles(list)
          if (!selectedProfileId && list.length > 0) {
            const def = list.find((p) => p.is_system_default && p.name.includes('Balanced')) || list[0]
            setSelectedProfileId(def.id)
          }
        }
      } catch (err) {
        console.error('Failed to load retrieval profiles for chat:', err)
      }
    }
    loadProfiles()
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
        userHasScrolledUp.current = true
      }
    }
  }

  const handleScroll = () => {
    if (!chatContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const distanceToBottom = scrollHeight - scrollTop - clientHeight

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

    const previousTurns = priorMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const activeProf = profiles.find((p) => p.id === selectedProfileId)
    const effectiveTopK = activeProf?.top_k ?? 5
    const effectiveWindowSize = activeProf?.window_size ?? 1
    const effectiveTemperature = activeProf?.temperature ?? 0.2
    const effectiveDocIds = selectedDocIds.length > 0
      ? selectedDocIds
      : (activeProf?.document_ids && activeProf.document_ids.length > 0 ? activeProf.document_ids : [])

    await startStream({
      query: queryText,
      documentIds: effectiveDocIds,
      messages: previousTurns,
      topK: effectiveTopK,
      windowSize: effectiveWindowSize,
      temperature: effectiveTemperature,
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

    const updatedTitle =
      activeSession.messages.length === 0
        ? text.slice(0, 36) + (text.length > 36 ? '...' : '')
        : activeSession.title

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

    const msgs = [...activeSession.messages]
    const lastMsg = msgs[msgs.length - 1]

    let priorTurns = []
    let queryToRerun = ''

    if (lastMsg.role === 'assistant') {
      const withoutLastAssistant = msgs.slice(0, -1)
      const lastUserMsg = withoutLastAssistant[withoutLastAssistant.length - 1]
      if (!lastUserMsg || lastUserMsg.role !== 'user') return

      queryToRerun = lastUserMsg.content
      priorTurns = withoutLastAssistant.slice(0, -1)

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

  // ── Feature 3: Inline Renaming in Sidebar List ─────────────────────────
  const handleStartRename = (session, e) => {
    if (e) e.stopPropagation()
    setRenamingTitleText(session.title || 'New Conversation')
    setEditingSessionTitleId(session.id)
  }

  const handleSaveRename = (sessionId) => {
    const targetId = sessionId || editingSessionTitleId
    if (!targetId) return
    const trimmed = renamingTitleText.trim()
    if (trimmed) {
      setSessions((prev) =>
        prev.map((s) => (s.id === targetId ? { ...s, title: trimmed } : s))
      )
    }
    setEditingSessionTitleId(null)
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
      {/* ── 1. Serene Conversation Sidebar Component ─────────────────────── */}
      <ChatSidebar
        isOpen={sidebarOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(sessionId) => {
          if (isStreaming) abortStream()
          setActiveSessionId(sessionId)
          resetStream()
          userHasScrolledUp.current = false
          setShowScrollBottom(false)
          setEditingMessageId(null)
        }}
        onCreateNewChat={handleCreateNewChat}
        onStartRename={handleStartRename}
        onSaveRename={handleSaveRename}
        editingSessionTitleId={editingSessionTitleId}
        renamingTitleText={renamingTitleText}
        setRenamingTitleText={setRenamingTitleText}
        renameInputRef={renameInputRef}
        onCancelRename={() => setEditingSessionTitleId(null)}
        onRequestDeleteSession={handleRequestDeleteSession}
        documentsCount={documents.length}
      />

      {/* ── 2. Editorial Central Chat Column ────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Minimalist Header Bar */}
        <header className="h-13 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 sm:px-8 flex items-center justify-between gap-4 shrink-0 z-10">
          <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
            {/* Sidebar Toggle Button always visible on top bar */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
              title={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>

            {!sidebarOpen && (
              <button
                onClick={handleCreateNewChat}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-blue-500/40 hover:bg-blue-500/5 text-[var(--text-primary)] text-xs font-semibold shadow-2xs transition-all cursor-pointer group shrink-0"
                title="Start a new conversation"
              >
                <Plus size={13} className="text-blue-500 group-hover:rotate-90 transition-transform duration-200" />
                <span className="hidden sm:inline">New</span>
              </button>
            )}

            {/* Conversation Name in Header */}
            <div className="truncate flex items-center gap-2 max-w-lg">
              <h2 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
                {activeSession.title || 'New Conversation'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-xs">
            {/* Retrieval Profile Selector in Top Bar */}
            {profiles.length > 0 && (
              <div className="w-38 sm:w-44">
                <CustomSelect
                  isMulti={false}
                  value={selectedProfileId}
                  onChange={(val) => {
                    setSelectedProfileId(val)
                    const found = profiles.find((p) => p.id === val)
                    if (found && found.document_ids && found.document_ids.length > 0) {
                      setSelectedDocIds(found.document_ids)
                    }
                  }}
                  placeholder="Select Profile"
                  options={profiles.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </div>
            )}

            {/* Document Filter Scope in Top Bar */}
            <div className="w-48 sm:w-56">
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

            {/* Feature 5: Export Thread to Markdown */}
            {activeSession.messages.length > 0 && (
              <button
                onClick={handleExportMarkdown}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-2xs"
                title="Export conversation to Markdown (.md)"
              >
                <Download size={12} className="text-blue-500" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}
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
              const isCopied = copiedMessageId === msg.id
              const isLastTurn = index === activeSession.messages.length - 1
              const isEditing = editingMessageId === msg.id

              return (
                <ChatMessageItem
                  key={msg.id}
                  message={msg}
                  isLastTurn={isLastTurn}
                  isStreaming={isStreaming}
                  isCopied={isCopied}
                  onCopy={handleCopyMessage}
                  onRegenerate={handleRegenerateLastResponse}
                  onCitationClick={(cite) => setSelectedCitation(cite)}
                  isEditing={isEditing}
                  editPromptText={editPromptText}
                  setEditPromptText={setEditPromptText}
                  onStartEdit={handleStartEditMessage}
                  onCancelEdit={handleCancelEdit}
                  onConfirmEdit={handleConfirmEditAndRerun}
                />
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
                    <StreamingMarkdown
                      content={streamedText}
                      isStreaming={true}
                      citations={citations || []}
                      onCitationClick={(cite) => setSelectedCitation(cite)}
                    />
                  )}

                  {/* Citations Found Live */}
                  {citations && citations.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1 mr-1">
                        Sources:
                      </span>
                      {citations.map((cite, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => setSelectedCitation(cite)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-blue-500/50 hover:bg-blue-500/5 text-[11px] text-[var(--text-secondary)] hover:text-blue-500 transition-all cursor-pointer shadow-2xs"
                        >
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

        {/* ── 3. Floating Input Island Component ────────────────────────── */}
        <ChatComposer
          inputPrompt={inputPrompt}
          setInputPrompt={setInputPrompt}
          onSubmit={handleSendMessage}
          isStreaming={isStreaming}
          onAbort={abortStream}
          selectedDocIds={selectedDocIds}
          setSelectedDocIds={setSelectedDocIds}
          documents={documents}
          textareaRef={textareaRef}
          onKeyDown={handleKeyDown}
          showScrollBottom={showScrollBottom}
          hasMessages={hasMessages}
          onScrollToBottom={() => {
            userHasScrolledUp.current = false
            setShowScrollBottom(false)
            scrollToBottom('smooth')
          }}
        />

        {/* ── 4. Grounding Citation Source Drawer ──────────────────────── */}
        {selectedCitation && (
          <CitationSourceDrawer
            citation={selectedCitation}
            onClose={() => setSelectedCitation(null)}
          />
        )}

        {/* ── 5. Delete Confirmation Modal Component ────────────────────── */}
        <DeleteSessionModal
          session={sessionToDelete}
          onClose={() => setSessionToDelete(null)}
          onConfirm={handleConfirmDeleteSession}
        />
      </main>
    </div>
  )
}
