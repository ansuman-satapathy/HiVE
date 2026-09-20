import { useState, useRef, useCallback, useEffect } from 'react'
import { tokenStorage } from '../utils/storage'

/**
 * Custom React hook for consuming Server-Sent Events (SSE) streaming APIs via POST requests.
 * Manages streaming lifecycle, token accumulation, status phases, citations,
 * ReAct agent reasoning steps (thoughts, tool calls, tool results), and abort controls.
 */
export function useEventStream() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [status, setStatus] = useState(null) // { stage: string, message: string }
  const [citations, setCitations] = useState([])
  const [reasoningSteps, setReasoningSteps] = useState([]) // Array of { type: 'thought' | 'tool_call' | 'tool_result', ... }
  const [error, setError] = useState(null)

  const abortControllerRef = useRef(null)

  // Abort active stream
  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsStreaming(false)
      setStatus(null)
    }
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  /**
   * Start streaming request
   */
  const startStream = useCallback(
    async ({
      query,
      documentIds = null,
      messages = [],
      topK = 5,
      windowSize = 1,
      temperature = 0.2,
      onToken = null,
      onDone = null,
      onError = null,
    }) => {
      // Abort any existing ongoing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const controller = new AbortController()
      abortControllerRef.current = controller

      setIsStreaming(true)
      setStreamedText('')
      setStatus({ stage: 'agent_reasoning', message: 'Analyzing question and reasoning...' })
      setCitations([])
      setReasoningSteps([])
      setError(null)

      let accumulated = ''
      let capturedCitations = []
      let capturedSteps = []

      try {
        const token = tokenStorage.getToken()
        const cleanDocIds = Array.isArray(documentIds)
          ? documentIds.filter(Boolean)
          : null

        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            query: query.trim(),
            document_ids: cleanDocIds && cleanDocIds.length > 0 ? cleanDocIds : null,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            top_k: topK,
            window_size: windowSize,
            temperature,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.detail || `Server error: ${res.status} ${res.statusText}`)
        }

        if (!res.body) {
          throw new Error('ReadableStream not supported by server response.')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Split complete SSE blocks separated by double newline
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() || '' // Keep trailing partial block

          for (const block of blocks) {
            const lines = block.split('\n')
            let eventType = 'message'
            let eventDataStr = ''

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.replace('event:', '').trim()
              } else if (line.startsWith('data:')) {
                eventDataStr = line.replace('data:', '').trim()
              }
            }

            if (!eventDataStr) continue

            try {
              const data = JSON.parse(eventDataStr)

              if (eventType === 'status') {
                setStatus({ stage: data.stage, message: data.message })
              } else if (eventType === 'thought') {
                const step = {
                  type: 'thought',
                  thought: data.thought,
                  iteration: data.iteration,
                  timestamp: Date.now(),
                }
                capturedSteps = [...capturedSteps, step]
                setReasoningSteps((prev) => [...prev, step])
              } else if (eventType === 'tool_call') {
                const step = {
                  type: 'tool_call',
                  tool: data.tool,
                  tool_input: data.tool_input,
                  iteration: data.iteration,
                  timestamp: Date.now(),
                }
                capturedSteps = [...capturedSteps, step]
                setReasoningSteps((prev) => [...prev, step])
              } else if (eventType === 'tool_result') {
                const step = {
                  type: 'tool_result',
                  tool: data.tool,
                  summary: data.summary,
                  citations: data.citations || [],
                  iteration: data.iteration,
                  timestamp: Date.now(),
                }
                capturedSteps = [...capturedSteps, step]
                setReasoningSteps((prev) => [...prev, step])
              } else if (eventType === 'context') {
                if (Array.isArray(data.citations)) {
                  capturedCitations = data.citations
                  setCitations(data.citations)
                }
              } else if (eventType === 'token') {
                const delta = data.delta || ''
                accumulated += delta
                setStreamedText(accumulated)
                if (onToken) onToken(delta, accumulated)
              } else if (eventType === 'done') {
                setStatus(null)
                setIsStreaming(false)
                if (onDone) {
                  onDone({
                    text: accumulated,
                    finishReason: data.finish_reason,
                    citations: capturedCitations,
                    reasoningSteps: capturedSteps,
                  })
                }
              } else if (eventType === 'error') {
                const errMsg = data.error || data.message || 'Stream encountered an error.'
                setError(errMsg)
                setIsStreaming(false)
                if (onError) onError(new Error(errMsg))
              }
            } catch (parseErr) {
              console.warn('Failed to parse SSE payload:', eventDataStr, parseErr)
            }
          }
        }

        setIsStreaming(false)
        setStatus(null)
        abortControllerRef.current = null
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('Stream aborted by user.')
        } else {
          console.error('Chat stream error:', err)
          setError(err.message || 'Failed to complete chat stream')
          if (onError) onError(err)
        }
        setIsStreaming(false)
        setStatus(null)
        abortControllerRef.current = null
      }
    },
    []
  )

  return {
    startStream,
    abortStream,
    isStreaming,
    streamedText,
    status,
    citations,
    reasoningSteps,
    error,
    reset: () => {
      setStreamedText('')
      setCitations([])
      setReasoningSteps([])
      setStatus(null)
      setError(null)
    },
  }
}
