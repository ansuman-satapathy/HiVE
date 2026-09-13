import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { tokenStorage } from '../utils/storage'

const TaskQueueContext = createContext(null)

export function TaskQueueProvider({ children }) {
  const [queueData, setQueueData] = useState({
    active_count: 0,
    active_tasks: [],
    recent_completed: [],
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isPollingRef = useRef(false)

  const fetchQueue = useCallback(async () => {
    if (isPollingRef.current) return
    const token = tokenStorage.getToken()
    if (!token) return

    try {
      isPollingRef.current = true
      const res = await fetch('/api/documents/queue', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setQueueData(data)
      }
    } catch (err) {
      console.error('Queue poll error:', err)
    } finally {
      isPollingRef.current = false
    }
  }, [])

  const activeCount = queueData?.active_count || 0

  useEffect(() => {
    let timeoutId
    let isMounted = true

    const runPoll = async () => {
      await fetchQueue()
      if (!isMounted) return
      // When files are actively parsing, chunking, or indexing, poll aggressively every 1s
      // Otherwise poll every 8s (or 2s when drawer is open)
      const interval = activeCount > 0 ? 1000 : (drawerOpen ? 2000 : 8000)
      timeoutId = setTimeout(runPoll, interval)
    }

    runPoll()
    return () => {
      isMounted = false
      clearTimeout(timeoutId)
    }
  }, [fetchQueue, activeCount, drawerOpen])

  return (
    <TaskQueueContext.Provider
      value={{
        queueData,
        activeCount,
        drawerOpen,
        setDrawerOpen,
        fetchQueue,
      }}
    >
      {children}
    </TaskQueueContext.Provider>
  )
}

export function useTaskQueue() {
  const context = useContext(TaskQueueContext)
  if (!context) {
    throw new Error('useTaskQueue must be used within a TaskQueueProvider')
  }
  return context
}
