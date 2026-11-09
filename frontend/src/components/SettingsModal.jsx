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
  ExternalLink
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { tokenStorage } from '../utils/storage'

export default function SettingsModal({ isOpen, onClose }) {
  const { user, setSession } = useAuth()
  const [activeTab, setActiveTab] = useState('model') // 'model' | 'security' | 'mcp'

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
        }
      } catch (err) {
        console.warn('Failed to load settings:', err)
      } finally {
        setLoadingSettings(false)
      }
    }

    fetchSettings()
  }, [isOpen, user])

  if (!isOpen) return null

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
            message: 'No active Ollama instance detected on localhost:11434. Make sure Ollama is running.',
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
      setModelSuccessMsg('Model configuration saved and active!')
      setTimeout(() => setModelSuccessMsg(null), 3000)
    } catch (err) {
      setModelErrorMsg(err.message)
    } finally {
      setSavingModel(false)
    }
  }

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
                  {/* Provider Radio Cards */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-primary)] mb-2.5">
                      Select LLM Provider
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
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                provider === 'ollama'
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-[var(--border-strong)] bg-transparent'
                              }`}
                            >
                              {provider === 'ollama' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 font-semibold border border-emerald-500/20 whitespace-nowrap shrink-0">
                              Zero Cost
                            </span>
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
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                provider === 'openai'
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-[var(--border-strong)] bg-transparent'
                              }`}
                            >
                              {provider === 'openai' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-500 font-semibold border border-sky-500/20 whitespace-nowrap shrink-0">
                              OpenAI Spec
                            </span>
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
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                provider === 'local'
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-[var(--border-strong)] bg-transparent'
                              }`}
                            >
                              {provider === 'local' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 font-semibold border border-amber-500/20 whitespace-nowrap shrink-0">
                              Demo Mode
                            </span>
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

                    <button
                      type="submit"
                      disabled={savingModel}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ml-auto"
                    >
                      {savingModel && <Loader2 size={13} className="animate-spin" />}
                      <span>Save &amp; Activate Model</span>
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

