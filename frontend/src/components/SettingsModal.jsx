import { useState, useEffect, useMemo } from 'react'
import {
  X,
  Cpu,
  ShieldCheck,
  Bot,
  Check,
  AlertCircle,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  Radio,
  Sparkles,
  KeyRound,
  User,
  Lock,
  ExternalLink,
  Layers,
  Trash2,
  Plus,
  CheckCircle2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { tokenStorage } from '../utils/storage'

export default function SettingsModal({ isOpen, initialTab = 'model', onClose }) {
  const { user, setSession } = useAuth()
  const [activeTab, setActiveTab] = useState(initialTab || 'model') // 'model' | 'embeddings' | 'security' | 'mcp'

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])

  // Model Settings State
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [savingModel, setSavingModel] = useState(false)
  const [provider, setProvider] = useState('ollama')
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434/v1')
  const [modelName, setModelName] = useState('llama3.2')
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [allowDemoAutofill, setAllowDemoAutofill] = useState(true)

  // Multi-Model Catalog State
  const [modelsList, setModelsList] = useState([])

  // Embedding Settings State
  const [embeddingProvider, setEmbeddingProvider] = useState('fastembed')
  const [embeddingModel, setEmbeddingModel] = useState('BAAI/bge-small-en-v1.5')
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState('http://host.docker.internal:11434/v1')
  const [embeddingApiKey, setEmbeddingApiKey] = useState('')
  const [hasEmbeddingApiKey, setHasEmbeddingApiKey] = useState(false)
  const [showEmbeddingApiKey, setShowEmbeddingApiKey] = useState(false)
  const [testingEmbedding, setTestingEmbedding] = useState(false)
  const [embeddingTestResult, setEmbeddingTestResult] = useState(null)
  const [savingEmbedding, setSavingEmbedding] = useState(false)
  const [embeddingSuccessMsg, setEmbeddingSuccessMsg] = useState(null)
  const [embeddingErrorMsg, setEmbeddingErrorMsg] = useState(null)
  const [detectingOllamaEmbedding, setDetectingOllamaEmbedding] = useState(false)
  const [detectedOllamaEmbeddingModels, setDetectedOllamaEmbeddingModels] = useState([])

  // Local detection & Test state
  const [detectingLocal, setDetectingLocal] = useState(false)
  const [detectedModels, setDetectedModels] = useState([])
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [modelSuccessMsg, setModelSuccessMsg] = useState(null)
  const [modelErrorMsg, setModelErrorMsg] = useState(null)

  const isCloudProvider = useMemo(() => {
    if (provider === 'local' || provider === 'ollama') return false
    return !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1') && !baseUrl.includes('host.docker.internal')
  }, [provider, baseUrl])

  const canTestConnection = useMemo(() => {
    if (testingConnection) return false
    if (provider === 'local') return false
    if (!baseUrl || !baseUrl.trim()) return false
    if (!modelName || !modelName.trim()) return false
    if (isCloudProvider && !apiKey.trim() && !hasApiKey) return false
    return true
  }, [testingConnection, provider, baseUrl, modelName, isCloudProvider, apiKey, hasApiKey])

  // Account & Security State
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)
  const [profileError, setProfileError] = useState(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState(null)
  const [passwordError, setPasswordError] = useState(null)

  // MCP copy state
  const [copiedMcp, setCopiedMcp] = useState(false)

  // Load existing settings when modal opens
  useEffect(() => {
    if (!isOpen) return

    setFullName(user?.full_name || '')
    setEmail(user?.email || '')
    setTestResult(null)
    setModelSuccessMsg(null)
    setModelErrorMsg(null)
    setProfileMsg(null)
    setProfileError(null)
    setPasswordMsg(null)
    setPasswordError(null)

    const fetchSettings = async () => {
      setLoadingSettings(true)
      const token = tokenStorage.getToken()
      try {
        const res = await fetch('/api/settings', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (res.ok) {
          const data = await res.json()
          setProvider(data.llm_provider || 'ollama')
          setBaseUrl(data.llm_base_url || 'http://localhost:11434/v1')
          setModelName(data.llm_model || 'llama3.2')
          setHasApiKey(data.has_api_key)
          setAllowDemoAutofill(data.allow_demo_autofill ?? true)
          setModelsList(data.models || [])
          setEmbeddingProvider(data.embedding_provider || 'fastembed')
          setEmbeddingModel(data.embedding_model || 'BAAI/bge-small-en-v1.5')
          if (data.embedding_base_url) setEmbeddingBaseUrl(data.embedding_base_url)
          setHasEmbeddingApiKey(data.has_embedding_api_key || false)
        }
      } catch (err) {
        console.warn('Failed to load settings:', err)
      } finally {
        setLoadingSettings(false)
      }
    }

    fetchSettings()
  }, [isOpen, user])

  // Auto-detect local Ollama models
  const handleDetectLocal = async () => {
    setDetectingLocal(true)
    setTestResult(null)
    const token = tokenStorage.getToken()
    try {
      const res = await fetch('/api/settings/detect-local-models', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        if (data.available && data.models.length > 0) {
          setDetectedModels(data.models)
          if (data.endpoint) setBaseUrl(data.endpoint)
          if (!modelName || !data.models.includes(modelName)) {
            setModelName(data.models[0])
          }
          setTestResult({
            success: true,
            message: `Found Ollama with ${data.models.length} model(s): ${data.models.join(', ')}`,
          })
        } else {
          setTestResult({
            success: false,
            message: 'No active Ollama instance detected. If Ollama is running on your host machine, set OLLAMA_HOST=0.0.0.0 so Docker can connect to host.docker.internal:11434.',
          })
        }
      }
    } catch (err) {
      setTestResult({ success: false, message: `Detection error: ${err.message}` })
    } finally {
      setDetectingLocal(false)
    }
  }

  // Test LLM connection
  const handleTestConnection = async () => {
    if (!canTestConnection) {
      if (isCloudProvider && !apiKey.trim() && !hasApiKey) {
        setTestResult({
          success: false,
          message: 'An API key is required to test cloud endpoints. Please enter an API key above.',
        })
      } else if (!baseUrl.trim() || !modelName.trim()) {
        setTestResult({
          success: false,
          message: 'Please provide both an API Base URL and a Model Identifier.',
        })
      }
      return
    }

    setTestingConnection(true)
    setTestResult(null)
    const token = tokenStorage.getToken()
    try {
      const res = await fetch('/api/settings/test-llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          provider,
          base_url: baseUrl,
          model_name: modelName,
          api_key: apiKey || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const errorMsg = data?.message || data?.detail || `Server returned error HTTP ${res.status}`
        setTestResult({
          success: false,
          message: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
        })
      } else {
        setTestResult({
          success: data?.success ?? true,
          latency_ms: data?.latency_ms,
          message: data?.message || (data?.success ? 'Connected successfully!' : 'Connection test failed'),
        })
      }
    } catch (err) {
      setTestResult({ success: false, message: `Connection test error: ${err.message}` })
    } finally {
      setTestingConnection(false)
    }
  }

  // Save Model Settings
  const handleSaveModelSettings = async (e) => {
    e.preventDefault()
    setSavingModel(true)
    setModelSuccessMsg(null)
    setModelErrorMsg(null)
    const token = tokenStorage.getToken()

    try {
      const payload = {
        llm_provider: provider,
        llm_base_url: baseUrl,
        llm_model: modelName,
        allow_demo_autofill: allowDemoAutofill,
      }
      if (apiKey.trim()) {
        payload.llm_api_key = apiKey.trim()
      }

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to update settings')
      }

      const data = await res.json()
      setHasApiKey(data.has_api_key)
      setApiKey('')
      if (data.models) setModelsList(data.models)
      setModelSuccessMsg('Model configuration saved and active!')
      window.dispatchEvent(new CustomEvent('models-updated'))
      setTimeout(() => setModelSuccessMsg(null), 3000)
    } catch (err) {
      setModelErrorMsg(err.message)
    } finally {
      setSavingModel(false)
    }
  }

  // Activate model from catalog
  const handleActivateModel = async (modelItem) => {
    const token = tokenStorage.getToken()
    try {
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...modelItem,
          is_active: true,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setModelsList(data.models || [])
        setModelName(modelItem.model_name || modelItem.name)
        setProvider(modelItem.provider)
        if (modelItem.base_url) setBaseUrl(modelItem.base_url)
        window.dispatchEvent(new CustomEvent('models-updated'))
      }
    } catch (err) {
      console.error('Failed to activate model:', err)
    }
  }

  // Delete model from catalog
  const handleDeleteModel = async (modelId) => {
    const token = tokenStorage.getToken()
    try {
      const res = await fetch(`/api/settings/models/${modelId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setModelsList(data.models || [])
        window.dispatchEvent(new CustomEvent('models-updated'))
      }
    } catch (err) {
      console.error('Failed to delete model:', err)
    }
  }

  // Add model to catalog
  const handleAddModelToCatalog = async () => {
    const token = tokenStorage.getToken()
    try {
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: `${modelName} (${provider})`,
          provider,
          base_url: baseUrl,
          model_name: modelName,
          api_key: apiKey.trim() || undefined,
          is_active: false,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setModelsList(data.models || [])
        setModelSuccessMsg(`Added '${modelName}' to models catalog!`)
        setTimeout(() => setModelSuccessMsg(null), 3000)
        window.dispatchEvent(new CustomEvent('models-updated'))
      }
    } catch (err) {
      setModelErrorMsg(err.message)
    }
  }

  // Save Embedding Settings
  const handleSaveEmbeddingSettings = async (e) => {
    e.preventDefault()
    setSavingEmbedding(true)
    setEmbeddingSuccessMsg(null)
    setEmbeddingErrorMsg(null)
    const token = tokenStorage.getToken()

    try {
      const payload = {
        embedding_provider: embeddingProvider,
        embedding_model: embeddingModel,
        embedding_base_url: embeddingBaseUrl,
      }
      if (embeddingApiKey.trim()) {
        payload.embedding_api_key = embeddingApiKey.trim()
      }

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to update embedding settings')
      }

      const data = await res.json()
      setHasEmbeddingApiKey(data.has_embedding_api_key)
      setEmbeddingApiKey('')
      setEmbeddingSuccessMsg('Embedding settings saved successfully!')
      setTimeout(() => setEmbeddingSuccessMsg(null), 3500)
    } catch (err) {
      setEmbeddingErrorMsg(err.message)
    } finally {
      setSavingEmbedding(false)
    }
  }

  // Test Embedding Connection
  const handleTestEmbedding = async () => {
    setTestingEmbedding(true)
    setEmbeddingTestResult(null)
    const token = tokenStorage.getToken()
    try {
      const res = await fetch('/api/settings/test-embedding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          provider: embeddingProvider,
          model_name: embeddingModel,
          base_url: embeddingBaseUrl,
          api_key: embeddingApiKey.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const errorMsg = data?.message || data?.detail || `Server returned error HTTP ${res.status}`
        setEmbeddingTestResult({
          success: false,
          message: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
        })
      } else {
        setEmbeddingTestResult(data)
      }
    } catch (err) {
      setEmbeddingTestResult({ success: false, message: `Embedding test error: ${err.message}` })
    } finally {
      setTestingEmbedding(false)
    }
  }

  // Detect local Ollama embedding models
  const handleDetectOllamaEmbedding = async () => {
    setDetectingOllamaEmbedding(true)
    setEmbeddingTestResult(null)
    const token = tokenStorage.getToken()
    try {
      const res = await fetch('/api/settings/detect-local-models', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        if (data.available && data.models.length > 0) {
          setDetectedOllamaEmbeddingModels(data.models)
          if (data.endpoint) setEmbeddingBaseUrl(data.endpoint)
          const embedCandidates = data.models.filter((m) => {
            const low = m.toLowerCase()
            return low.includes('embed') || low.includes('minilm') || low.includes('bge') || low.includes('arctic') || low.includes('mxbai')
          })
          if (embedCandidates.length > 0) {
            setEmbeddingModel(embedCandidates[0])
            setEmbeddingTestResult({
              success: true,
              message: `Found installed local embedding model: ${embedCandidates.join(', ')}`,
            })
          } else {
            // Do not prefill uninstalled model
            setEmbeddingModel('')
            setEmbeddingTestResult({
              success: false,
              message: `Ollama is active with model(s): ${data.models.join(', ')}. No dedicated embedding model is installed yet. Run 'ollama pull nomic-embed-text' on your host.`,
            })
          }
        } else {
          setEmbeddingTestResult({
            success: false,
            message: 'No active Ollama instance detected at host.docker.internal:11434. Make sure Ollama is running with OLLAMA_HOST=0.0.0.0.',
          })
        }
      }
    } catch (err) {
      setEmbeddingTestResult({ success: false, message: `Detection error: ${err.message}` })
    } finally {
      setDetectingOllamaEmbedding(false)
    }
  }

  // Auto-discover Ollama embedding models when entering Embeddings tab with Ollama selected
  useEffect(() => {
    if (isOpen && activeTab === 'embeddings' && embeddingProvider === 'ollama' && detectedOllamaEmbeddingModels.length === 0 && !detectingOllamaEmbedding) {
      handleDetectOllamaEmbedding()
    }
  }, [isOpen, activeTab, embeddingProvider])

  // Update Profile Name/Email
  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)
    setProfileError(null)
    const token = tokenStorage.getToken()

    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ full_name: fullName, email }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to update profile')
      }

      const updated = await res.json()
      if (token) await setSession(token)
      setProfileMsg('Profile updated successfully!')
      setTimeout(() => setProfileMsg(null), 3000)
    } catch (err) {
      setProfileError(err.message)
    } finally {
      setSavingProfile(false)
    }
  }

  // Change Password
  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordMsg(null)
    setPasswordError(null)

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters')
      return
    }

    setChangingPassword(true)
    const token = tokenStorage.getToken()

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to change password')
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMsg('Password changed successfully!')
      setTimeout(() => setPasswordMsg(null), 3000)
    } catch (err) {
      setPasswordError(err.message)
    } finally {
      setChangingPassword(false)
    }
  }

  const mcpConfigCode = JSON.stringify(
    {
      mcpServers: {
        hive: {
          url: `${window.location.origin}/api/mcp`,
          headers: {
            Authorization: `Bearer ${tokenStorage.getToken() || '<YOUR_JWT_TOKEN>'}`,
          },
        },
      },
    },
    null,
    2
  )

  const handleCopyMcp = () => {
    navigator.clipboard.writeText(mcpConfigCode)
    setCopiedMcp(true)
    setTimeout(() => setCopiedMcp(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
              <Cpu size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Workspace Settings
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Manage LLM provider, credentials, security, and MCP integrations
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-[var(--border-default)] bg-[var(--bg-canvas)]">
          <button
            onClick={() => setActiveTab('model')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'model'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Cpu size={14} />
            <span>LLM &amp; Provider</span>
          </button>

          <button
            onClick={() => setActiveTab('embeddings')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'embeddings'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers size={14} />
            <span>Embeddings</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ShieldCheck size={14} />
            <span>Security &amp; Account</span>
          </button>

          <button
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'mcp'
                ? 'border-blue-500 text-blue-500'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Bot size={14} />
            <span>MCP &amp; Extensibility</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ── TAB 1: AI Model & Provider ── */}
          {activeTab === 'model' && (
            <form onSubmit={handleSaveModelSettings} className="space-y-5">
              {loadingSettings ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                  <span>Loading workspace settings...</span>
                </div>
              ) : (
                <>
                  {/* Configured Models Catalog */}
                  {modelsList.length > 0 && (
                    <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-[var(--text-primary)]">
                          Connected Models Catalog ({modelsList.length})
                        </label>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Switch between these in the chat composer
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {modelsList.map((m) => {
                          const isActive = m.is_active || (m.model_name === modelName && m.provider === provider)
                          return (
                            <div
                              key={m.id || m.model_name}
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                                isActive
                                  ? 'border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20'
                                  : 'border-[var(--border-default)] bg-[var(--bg-surface)]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  isActive ? 'bg-blue-500 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                                }`}>
                                  <Cpu size={14} />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-[var(--text-primary)] font-mono text-[11px] truncate">
                                    {m.model_name || m.name}
                                  </div>
                                  <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                                    <span className="capitalize">{m.provider}</span>
                                    <span>•</span>
                                    <span className="truncate max-w-[200px]">{m.base_url || 'local synthesizer'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isActive ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                                    <Check size={10} /> Active
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleActivateModel(m)}
                                    className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-blue-500/10 hover:border-blue-500/30 text-[11px] text-[var(--text-secondary)] hover:text-blue-500 font-medium transition-colors cursor-pointer"
                                  >
                                    Set Active
                                  </button>
                                )}
                                {modelsList.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteModel(m.id || m.model_name)}
                                    className="p-1 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                    title="Delete from catalog"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Provider Radio Cards */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-2.5">
                      Configure or Add Model
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Ollama / Local */}
                      <button
                        type="button"
                        onClick={() => {
                          setProvider('ollama')
                          setBaseUrl('http://localhost:11434/v1')
                          setModelName('llama3.2')
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          provider === 'ollama'
                            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                            : 'border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                provider === 'ollama'
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-[var(--border-strong)] bg-transparent'
                              }`}
                            >
                              {provider === 'ollama' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                          <div className="text-xs font-bold text-[var(--text-primary)] mb-1">
                            Local Ollama / vLLM
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            Connects to local Ollama or vLLM container.
                          </p>
                        </div>
                      </button>

                      {/* OpenAI / Custom */}
                      <button
                        type="button"
                        onClick={() => {
                          setProvider('openai')
                          setBaseUrl('https://api.openai.com/v1')
                          setModelName('gpt-4o-mini')
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          provider === 'openai'
                            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                            : 'border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                provider === 'openai'
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-[var(--border-strong)] bg-transparent'
                              }`}
                            >
                              {provider === 'openai' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                          <div className="text-xs font-bold text-[var(--text-primary)] mb-1">
                            OpenAI / Custom Cloud
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            OpenAI, Groq, NVIDIA NIM, or DeepSeek.
                          </p>
                        </div>
                      </button>

                      {/* Offline Fallback */}
                      <button
                        type="button"
                        onClick={() => setProvider('local')}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          provider === 'local'
                            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                            : 'border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                provider === 'local'
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-[var(--border-strong)] bg-transparent'
                              }`}
                            >
                              {provider === 'local' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                          <div className="text-xs font-bold text-[var(--text-primary)] mb-1">
                            Offline Synthesizer
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            Rule-based local synthesis with zero external requests.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Provider Configuration Fields */}
                  {provider !== 'local' && (
                    <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-4">
                      {/* Base URL */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-[var(--text-primary)]">
                            API Base URL
                          </label>
                          {provider === 'ollama' && (
                            <button
                              type="button"
                              onClick={handleDetectLocal}
                              disabled={detectingLocal}
                              className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              {detectingLocal ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Sparkles size={11} />
                              )}
                              <span>Auto-Detect Local Ollama</span>
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder="http://localhost:11434/v1 or https://api.openai.com/v1"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                        />

                        {/* Quick URL & Model Presets */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] text-[var(--text-muted)] mr-1">
                            Presets:
                          </span>
                          {provider === 'ollama' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setBaseUrl('http://localhost:11434/v1')
                                  setModelName('llama3.2')
                                }}
                                className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-blue-500 cursor-pointer"
                              >
                                Ollama (Host)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBaseUrl('http://host.docker.internal:11434/v1')
                                  setModelName('llama3.2')
                                }}
                                className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-blue-500 cursor-pointer"
                              >
                                Ollama (Docker)
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBaseUrl('http://localhost:8000/v1')
                                  setModelName('default')
                                }}
                                className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-blue-500 cursor-pointer"
                              >
                                vLLM (Port 8000)
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setBaseUrl('https://api.openai.com/v1')
                                  setModelName('gpt-4o-mini')
                                }}
                                className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-blue-500 cursor-pointer"
                              >
                                OpenAI
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBaseUrl('https://api.groq.com/openai/v1')
                                  setModelName('llama-3.3-70b-versatile')
                                }}
                                className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-blue-500 cursor-pointer"
                              >
                                Groq
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBaseUrl('https://integrate.api.nvidia.com/v1')
                                  setModelName('meta/llama-3.2-3b-instruct')
                                }}
                                className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-purple-500 cursor-pointer"
                              >
                                NVIDIA NIM
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setBaseUrl('https://api.deepseek.com/v1')
                                  setModelName('deepseek-chat')
                                }}
                                className="px-2 py-0.5 rounded-md text-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-blue-500 cursor-pointer"
                              >
                                DeepSeek
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Model Name */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                          Model Identifier
                        </label>
                        {detectedModels.length > 0 ? (
                          <div className="space-y-1.5">
                            <select
                              value={modelName}
                              onChange={(e) => setModelName(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                            >
                              {detectedModels.map((m) => (
                                <option key={m} value={m}>
                                  {m} (Installed locally)
                                </option>
                              ))}
                            </select>
                            <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                              <Check size={10} /> Auto-detected from local Ollama
                            </span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            required
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            placeholder={
                              provider === 'ollama'
                                ? 'llama3.2 or mistral'
                                : 'gpt-4o-mini or meta/llama-3.2-3b-instruct'
                            }
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                          />
                        )}
                      </div>

                      {/* API Key */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-[var(--text-primary)]">
                            API Key {provider === 'ollama' && '(Optional for Ollama)'}
                          </label>
                          {hasApiKey && (
                            <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              ✓ Key configured
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={hasApiKey ? '•••••••••••••••• (Leave blank to keep saved key)' : 'sk-... or nvapi-...'}
                            className="w-full pl-3 pr-10 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                          >
                            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Test Connection Result Feedback */}
                  {testResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        testResult.success
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                          : 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                      }`}
                    >
                      {testResult.success ? (
                        <Check size={14} className="shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold break-words">
                          {String(testResult.message || testResult.detail || (testResult.success ? 'Connection successful' : 'Connection test failed'))}
                        </p>
                        {testResult.latency_ms != null && (
                          <p className="text-[10.5px] opacity-80 mt-0.5">
                            Roundtrip response latency: {testResult.latency_ms}ms
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {Boolean(modelSuccessMsg) && (
                    <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-xs flex items-center gap-2">
                      <Check size={14} className="shrink-0" />
                      <span className="font-medium">{String(modelSuccessMsg)}</span>
                    </div>
                  )}

                  {Boolean(modelErrorMsg && String(modelErrorMsg).trim()) && (
                    <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span className="font-medium">{String(modelErrorMsg)}</span>
                    </div>
                  )}

                  {/* Form Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border-default)]">
                    <div>
                      {provider !== 'local' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={!canTestConnection}
                            className="px-3.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {testingConnection && <Loader2 size={13} className="animate-spin text-blue-500" />}
                            <span>Test Connection</span>
                          </button>
                          {!canTestConnection && isCloudProvider && !apiKey.trim() && !hasApiKey && (
                            <span className="text-[11px] text-[var(--text-muted)]">
                              API key required to test
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={handleAddModelToCatalog}
                        disabled={savingModel || !modelName.trim()}
                        className="px-3 py-2 rounded-xl border border-[var(--border-default)] hover:bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold transition-all cursor-pointer disabled:opacity-40"
                        title="Add this model configuration to the catalog without overriding the current active model"
                      >
                        + Add to Catalog
                      </button>

                      <button
                        type="submit"
                        disabled={savingModel}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        {savingModel && <Loader2 size={13} className="animate-spin" />}
                        <span>Save &amp; Activate Model</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </form>
          )}

          {/* ── TAB: Embeddings Configuration ── */}
          {activeTab === 'embeddings' && (
            <form onSubmit={handleSaveEmbeddingSettings} className="space-y-5">
              {loadingSettings ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                  <span>Loading embedding settings...</span>
                </div>
              ) : (
                <>
                  {/* Embedding Provider Selection */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-2.5">
                      Select Embedding Provider
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Local FastEmbed */}
                      <button
                        type="button"
                        onClick={() => {
                          setEmbeddingProvider('fastembed')
                          setEmbeddingModel('BAAI/bge-small-en-v1.5')
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          embeddingProvider === 'fastembed' || embeddingProvider === 'auto'
                            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                            : 'border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              embeddingProvider === 'fastembed' || embeddingProvider === 'auto'
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-[var(--border-strong)]'
                            }`}>
                              {(embeddingProvider === 'fastembed' || embeddingProvider === 'auto') && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              Local FastEmbed (In-Container)
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pl-6">
                            Zero external network requests. 384-dimensional dense vectors calculated directly inside backend.
                          </p>
                        </div>
                      </button>

                      {/* Ollama Embeddings */}
                      <button
                        type="button"
                        onClick={() => {
                          setEmbeddingProvider('ollama')
                          setEmbeddingBaseUrl('http://host.docker.internal:11434/v1')
                          handleDetectOllamaEmbedding()
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          embeddingProvider === 'ollama'
                            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                            : 'border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              embeddingProvider === 'ollama'
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-[var(--border-strong)]'
                            }`}>
                              {embeddingProvider === 'ollama' && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              Local Ollama Embeddings
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pl-6">
                            Connects to host Ollama using nomic-embed-text or all-minilm via /v1/embeddings.
                          </p>
                        </div>
                      </button>

                      {/* OpenAI Cloud Embeddings */}
                      <button
                        type="button"
                        onClick={() => {
                          setEmbeddingProvider('openai')
                          setEmbeddingBaseUrl('https://api.openai.com/v1')
                          setEmbeddingModel('text-embedding-3-small')
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          embeddingProvider === 'openai'
                            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                            : 'border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              embeddingProvider === 'openai'
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-[var(--border-strong)]'
                            }`}>
                              {embeddingProvider === 'openai' && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              OpenAI Embeddings
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pl-6">
                            Industry-standard cloud embeddings with text-embedding-3-small or large.
                          </p>
                        </div>
                      </button>

                      {/* NVIDIA NIM */}
                      <button
                        type="button"
                        onClick={() => {
                          setEmbeddingProvider('nvidia')
                          setEmbeddingBaseUrl('https://integrate.api.nvidia.com/v1')
                          setEmbeddingModel('nvidia/llama-3.2-nv-embedqa-1b-v2')
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          embeddingProvider === 'nvidia'
                            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                            : 'border-[var(--border-default)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              embeddingProvider === 'nvidia'
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-[var(--border-strong)]'
                            }`}>
                              {embeddingProvider === 'nvidia' && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <span className="text-xs font-bold text-[var(--text-primary)]">
                              NVIDIA NIM Embeddings
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pl-6">
                            NVIDIA NeMo & NV-EmbedQA models with high throughput.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Embedding Details Configuration */}
                  <div className="space-y-3.5">
                    {/* Base URL (if not fastembed) */}
                    {embeddingProvider !== 'fastembed' && embeddingProvider !== 'auto' && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-semibold text-[var(--text-primary)]">
                            Embedding API Base URL
                          </label>
                          {embeddingProvider === 'ollama' && (
                            <button
                              type="button"
                              onClick={() => setEmbeddingBaseUrl('http://host.docker.internal:11434/v1')}
                              className="text-[10px] text-blue-500 hover:underline cursor-pointer"
                            >
                              Reset to Host Ollama
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          value={embeddingBaseUrl}
                          onChange={(e) => setEmbeddingBaseUrl(e.target.value)}
                          placeholder="http://host.docker.internal:11434/v1"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}

                    {/* Embedding Model Identifier */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-[var(--text-primary)]">
                          Embedding Model Identifier
                        </label>
                        {embeddingProvider === 'ollama' && (
                          <button
                            type="button"
                            onClick={handleDetectOllamaEmbedding}
                            disabled={detectingOllamaEmbedding}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-600 transition-colors cursor-pointer"
                          >
                            <Sparkles size={11} className={detectingOllamaEmbedding ? 'animate-spin' : ''} />
                            <span>Auto-Detect Ollama Models</span>
                          </button>
                        )}
                      </div>

                      {embeddingProvider === 'fastembed' || embeddingProvider === 'auto' ? (
                        <div className="space-y-1.5">
                          <select
                            value={embeddingModel}
                            onChange={(e) => setEmbeddingModel(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <optgroup label="2026 SOTA Long-Context Standards (8,192 Tokens)">
                              <option value="BAAI/bge-m3">BAAI/bge-m3 (1024d • 8,192 ctx • Multilingual SOTA)</option>
                              <option value="nomic-ai/nomic-embed-text-v1.5">nomic-ai/nomic-embed-text-v1.5 (768d • 8,192 ctx • Matryoshka)</option>
                              <option value="mixedbread-ai/mxbai-embed-large">mixedbread-ai/mxbai-embed-large (1024d • 512 ctx • High Precision)</option>
                              <option value="Snowflake/snowflake-arctic-embed-m-v1.5">Snowflake/snowflake-arctic-embed-m-v1.5 (768d • 512 ctx • Top MTEB)</option>
                            </optgroup>
                            <optgroup label="Lightweight CPU Inference Standards (384d)">
                              <option value="BAAI/bge-small-en-v1.5">BAAI/bge-small-en-v1.5 (384d • 512 ctx • Recommended Default)</option>
                              <option value="sentence-transformers/all-MiniLM-L6-v2">sentence-transformers/all-MiniLM-L6-v2 (384d • 256 ctx • Ultra-fast)</option>
                            </optgroup>
                          </select>
                          <span className="text-[10px] text-emerald-500 flex items-center gap-1 font-medium">
                            <Check size={10} /> In-container FastEmbed engine (zero GPU or host dependencies)
                          </span>
                        </div>
                      ) : embeddingProvider === 'ollama' ? (
                        <div className="space-y-2.5">
                          {/* If detected host models has no embedding models */}
                          {detectedOllamaEmbeddingModels.length > 0 &&
                            !detectedOllamaEmbeddingModels.some((m) => {
                              const l = m.toLowerCase()
                              return l.includes('embed') || l.includes('minilm') || l.includes('bge') || l.includes('arctic') || l.includes('mxbai')
                            }) && (
                            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs space-y-2 animate-in fade-in">
                              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-semibold">
                                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                                <div>
                                  <div>No dedicated embedding model installed in Ollama.</div>
                                  <div className="text-[11px] font-normal opacity-90 mt-0.5">
                                    Detected host models: <span className="font-mono font-bold">{detectedOllamaEmbeddingModels.join(', ')}</span> (Chat LLMs, not optimized for vector search).
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 bg-[var(--bg-canvas)]/80 p-2 rounded-lg border border-amber-500/20 font-mono text-[11px]">
                                <span className="text-[var(--text-primary)] truncate">ollama pull nomic-embed-text</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText('ollama pull nomic-embed-text')
                                    setEmbeddingSuccessMsg('Copied "ollama pull nomic-embed-text" to clipboard!')
                                    setTimeout(() => setEmbeddingSuccessMsg(null), 2500)
                                  }}
                                  className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-400 font-sans text-[10px] font-semibold cursor-pointer shrink-0"
                                >
                                  Copy Command
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Model input or verified dropdown */}
                          {detectedOllamaEmbeddingModels.some((m) => {
                            const l = m.toLowerCase()
                            return l.includes('embed') || l.includes('minilm') || l.includes('bge') || l.includes('arctic') || l.includes('mxbai')
                          }) ? (
                            <div className="space-y-1.5">
                              <select
                                value={embeddingModel}
                                onChange={(e) => setEmbeddingModel(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
                              >
                                {detectedOllamaEmbeddingModels.map((m) => (
                                  <option key={m} value={m}>
                                    {m} (Installed in Ollama)
                                  </option>
                                ))}
                              </select>
                              <span className="text-[10px] text-emerald-500 flex items-center gap-1 font-medium">
                                <Check size={10} /> Auto-discovered from host Ollama
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                required
                                value={embeddingModel}
                                onChange={(e) => setEmbeddingModel(e.target.value)}
                                placeholder="Enter model name after pulling (e.g. nomic-embed-text)"
                                className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-blue-500"
                              />

                              {/* Presets to click when pulled */}
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                <span className="text-[var(--text-muted)]">Ollama Presets:</span>
                                {['nomic-embed-text', 'bge-m3', 'all-minilm', 'snowflake-arctic-embed'].map((cand) => (
                                  <button
                                    key={cand}
                                    type="button"
                                    onClick={() => setEmbeddingModel(cand)}
                                    className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                                      embeddingModel === cand
                                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-500 font-semibold'
                                        : 'bg-[var(--bg-canvas)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-blue-500/30'
                                    }`}
                                  >
                                    {cand}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          required
                          value={embeddingModel}
                          onChange={(e) => setEmbeddingModel(e.target.value)}
                          placeholder={
                            embeddingProvider === 'openai'
                              ? 'text-embedding-3-small'
                              : 'nvidia/llama-3.2-nv-embedqa-1b-v2'
                          }
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-blue-500"
                        />
                      )}
                    </div>

                    {/* API Key (if cloud) */}
                    {(embeddingProvider === 'openai' || embeddingProvider === 'nvidia') && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-xs font-semibold text-[var(--text-primary)]">
                            Embedding API Key
                          </label>
                          {hasEmbeddingApiKey && !embeddingApiKey && (
                            <span className="text-[10px] text-emerald-500 flex items-center gap-1 font-medium">
                              <Check size={10} /> Key configured
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type={showEmbeddingApiKey ? 'text' : 'password'}
                            value={embeddingApiKey}
                            onChange={(e) => setEmbeddingApiKey(e.target.value)}
                            placeholder={hasEmbeddingApiKey ? '•••••••••••••••• (Leave blank to keep existing)' : 'sk-... or nvapi-...'}
                            className="w-full pl-3 pr-9 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEmbeddingApiKey((prev) => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          >
                            {showEmbeddingApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Embedding Test Result Banner */}
                  {embeddingTestResult && (
                    <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 animate-in fade-in ${
                      embeddingTestResult.success
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                    }`}>
                      {embeddingTestResult.success ? (
                        <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold">{embeddingTestResult.message}</span>
                        {embeddingTestResult.dimension && (
                          <div className="text-[10px] opacity-80 mt-0.5">
                            Vector dimension: {embeddingTestResult.dimension} | Latency: {embeddingTestResult.latency_ms}ms
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Embedding Success Banner */}
                  {embeddingSuccessMsg && (
                    <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                      <CheckCircle2 size={14} className="shrink-0" />
                      <span className="font-medium">{embeddingSuccessMsg}</span>
                    </div>
                  )}

                  {/* Embedding Error Banner */}
                  {embeddingErrorMsg && (
                    <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span className="font-medium">{String(embeddingErrorMsg)}</span>
                    </div>
                  )}

                  {/* Form Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border-default)]">
                    <button
                      type="button"
                      onClick={handleTestEmbedding}
                      disabled={testingEmbedding}
                      className="px-3.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {testingEmbedding && <Loader2 size={13} className="animate-spin text-blue-500" />}
                      <span>Test Embedding</span>
                    </button>

                    <button
                      type="submit"
                      disabled={savingEmbedding}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {savingEmbedding && <Loader2 size={13} className="animate-spin" />}
                      <span>Save Embedding Settings</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* ── TAB 2: Security & Account ── */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Profile Details Form */}
              <form onSubmit={handleUpdateProfile} className="space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                  <User size={13} className="text-blue-500" />
                  Account Information
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {profileMsg && (
                  <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-xs flex items-center gap-2">
                    <Check size={13} />
                    <span>{profileMsg}</span>
                  </div>
                )}
                {profileError && (
                  <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
                    <AlertCircle size={13} />
                    <span>{profileError}</span>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                  >
                    {savingProfile ? 'Updating...' : 'Update Profile'}
                  </button>
                </div>
              </form>

              {/* Password Change Form */}
              <form onSubmit={handleChangePassword} className="pt-4 border-t border-[var(--border-default)] space-y-3.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                  <Lock size={13} className="text-amber-500" />
                  Change Password
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      New Password (min. 6 chars)
                    </label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {passwordMsg && (
                  <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-xs flex items-center gap-2">
                    <Check size={13} />
                    <span>{passwordMsg}</span>
                  </div>
                )}
                {passwordError && (
                  <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
                    <AlertCircle size={13} />
                    <span>{passwordError}</span>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                  >
                    {changingPassword ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </form>

              {/* Security Preferences: Demo Credentials Autofill Toggle */}
              <div className="pt-4 border-t border-[var(--border-default)] space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                  <KeyRound size={13} className="text-purple-500" />
                  Sign-In Security Preferences
                </h3>

                <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      Show "Fill Default Admin Credentials" on Sign-In screen
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                      Disable this in shared or production deployments to prevent revealing seeded demo credentials.
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={allowDemoAutofill}
                      onChange={async (e) => {
                        const nextVal = e.target.checked
                        setAllowDemoAutofill(nextVal)
                        const token = tokenStorage.getToken()
                        try {
                          await fetch('/api/settings', {
                            method: 'PATCH',
                            headers: {
                              'Content-Type': 'application/json',
                              ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({ allow_demo_autofill: nextVal }),
                          })
                        } catch (err) {
                          console.warn('Failed to update demo autofill:', err)
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-[var(--border-strong)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: MCP & Extensibility ── */}
          {activeTab === 'mcp' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Model Context Protocol (MCP) Server
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    HiVE runs a live MCP server at <code className="text-blue-500 font-mono">/api/mcp</code>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCopyMcp}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  {copiedMcp ? (
                    <>
                      <Check size={13} className="text-emerald-500" />
                      <span className="text-emerald-500">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy Client Config</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-[var(--text-secondary)] space-y-1">
                <p className="font-semibold text-blue-500 flex items-center gap-1.5">
                  <Radio size={12} className="animate-pulse" />
                  Claude Desktop &amp; Cursor Compatible
                </p>
                <p className="text-[11.5px] leading-relaxed">
                  Add this block to your <code className="font-mono text-blue-400">claude_desktop_config.json</code> or IDE MCP settings. External agents will automatically discover the <code className="font-mono text-blue-400">search_knowledge_base</code> tool.
                </p>
              </div>

              <pre className="p-3.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-default)] text-xs font-mono text-[var(--text-secondary)] overflow-x-auto leading-relaxed select-all">
                {mcpConfigCode}
              </pre>

              <div className="p-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Available Tools
                </span>
                <p className="text-xs text-[var(--text-primary)] font-mono">
                  search_knowledge_base(query, top_k=5, window_size=1)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[var(--border-default)] bg-[var(--bg-surface)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-primary)] transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

