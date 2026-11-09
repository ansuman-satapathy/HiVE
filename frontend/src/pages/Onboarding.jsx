import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertCircle,
  Sun,
  Moon,
  Cpu,
  KeyRound,
  ShieldCheck,
  User,
  Radio
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import HiveLogo from '../components/HiveLogo'

export default function Onboarding() {
  const [step, setStep] = useState(1) // 1: Admin, 2: AI Model, 3: Security & Launch
  const [fullName, setFullName] = useState('Workspace Admin')
  const [email, setEmail] = useState('admin@hive.com')
  const [password, setPassword] = useState('password123')

  // Step 2: AI Model Choice
  const [modelMode, setModelMode] = useState('ollama') // 'ollama' | 'cloud' | 'skip'
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434/v1')
  const [ollamaModel, setOllamaModel] = useState('llama3.2')
  const [detectingOllama, setDetectingOllama] = useState(false)
  const [detectedModels, setDetectedModels] = useState([])
  const [testStatus, setTestStatus] = useState(null)

  const [cloudProvider, setCloudProvider] = useState('openai') // 'openai' | 'nvidia'
  const [cloudBaseUrl, setCloudBaseUrl] = useState('https://api.openai.com/v1')
  const [cloudModel, setCloudModel] = useState('gpt-4o-mini')
  const [cloudApiKey, setCloudApiKey] = useState('')

  // Step 3: Security preferences
  const [allowDemoAutofill, setAllowDemoAutofill] = useState(true)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const { setSession } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    async function checkExisting() {
      try {
        const res = await fetch('/api/auth/status')
        if (res.ok) {
          const data = await res.json()
          if (data.initialized) {
            navigate('/login')
          }
        }
      } catch (err) {
        console.error('Failed to query status:', err)
      }
    }
    checkExisting()
  }, [navigate])

  const handleDetectOllama = async () => {
    setDetectingOllama(true)
    setTestStatus(null)
    try {
      const res = await fetch('/api/settings/detect-local-models')
      if (res.ok) {
        const data = await res.json()
        if (data.available && data.models.length > 0) {
          setDetectedModels(data.models)
          if (data.endpoint) setOllamaBaseUrl(data.endpoint)
          setOllamaModel(data.models[0])
          setTestStatus({
            success: true,
            message: `Found Ollama running with ${data.models.length} model(s): ${data.models.join(', ')}`,
          })
        } else {
          setTestStatus({
            success: false,
            message: 'Ollama not detected on localhost:11434. You can still proceed or skip for now.',
          })
        }
      }
    } catch {
      setTestStatus({
        success: false,
        message: 'Could not connect to Ollama. Ensure Ollama is running or skip to configure later.',
      })
    } finally {
      setDetectingOllama(false)
    }
  }

  const handleStep1Submit = (e) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleCompleteSetup = async () => {
    setLoading(true)
    setError(null)

    try {
      // 1. Register root admin account
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName }),
      })

      const registerData = await registerRes.json()
      if (!registerRes.ok) {
        throw new Error(registerData.detail || 'Failed to initialize administrator')
      }

      // 2. Login to get JWT
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const loginData = await loginRes.json()
      if (!loginRes.ok) {
        throw new Error('User created but login failed. Please sign in.')
      }

      const token = loginData.access_token

      // 3. Save workspace model & security settings
      const settingsPayload = {
        allow_demo_autofill: allowDemoAutofill,
      }

      if (modelMode === 'ollama') {
        settingsPayload.llm_provider = 'ollama'
        settingsPayload.llm_base_url = ollamaBaseUrl
        settingsPayload.llm_model = ollamaModel
      } else if (modelMode === 'cloud') {
        settingsPayload.llm_provider = cloudProvider
        settingsPayload.llm_base_url = cloudBaseUrl
        settingsPayload.llm_model = cloudModel
        if (cloudApiKey.trim()) settingsPayload.llm_api_key = cloudApiKey.trim()
      } else {
        settingsPayload.llm_provider = 'local'
      }

      await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settingsPayload),
      })

      await setSession(token)
      navigate('/workspace')
    } catch (err) {
      setError(err.message || 'Setup encountered an error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative transition-colors duration-200" style={{ backgroundColor: 'var(--bg-canvas)' }}>
      {/* Theme toggle */}
      <div className="absolute top-6 right-6">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all shadow-sm flex items-center justify-center cursor-pointer"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-slate-600" />}
        </button>
      </div>

      <div className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-8 sm:p-10 shadow-xl transition-all">
        {/* Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-3">
            <HiveLogo size="lg" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[11px] font-semibold mb-2">
            <Sparkles size={11} />
            <span>FIRST-RUN SETUP WIZARD</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Setup Your HiVE Workspace
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Configure admin credentials, LLM provider, and security
          </p>
        </div>

        {/* 3-Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8 pb-5 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-[var(--border-default)] text-[var(--text-muted)]'
            }`}>
              {step > 1 ? <Check size={13} /> : '1'}
            </div>
            <span className={`text-xs ${step === 1 ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              Admin
            </span>
          </div>

          <div className="w-6 h-px bg-[var(--border-default)]" />

          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-[var(--border-default)] text-[var(--text-muted)]'
            }`}>
              {step > 2 ? <Check size={13} /> : '2'}
            </div>
            <span className={`text-xs ${step === 2 ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              LLM Provider
            </span>
          </div>

          <div className="w-6 h-px bg-[var(--border-default)]" />

          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step >= 3 ? 'bg-blue-600 text-white' : 'bg-[var(--border-default)] text-[var(--text-muted)]'
            }`}>
              3
            </div>
            <span className={`text-xs ${step === 3 ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
              Launch
            </span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-3.5 mb-6 rounded-lg text-sm bg-red-500/10 border border-red-500/25 text-red-500 dark:text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── STEP 1: Admin Account ── */}
        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Administrator Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Workspace Admin"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hive.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Password (min. 6 characters)
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full mt-3 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <span>Next: Connect LLM</span>
              <ArrowRight size={15} />
            </button>
          </form>
        )}

        {/* ── STEP 2: AI Model Selection ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setModelMode('ollama')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  modelMode === 'ollama'
                    ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                    : 'border-[var(--border-default)] bg-[var(--bg-canvas)]'
                }`}
              >
                <Cpu size={16} className="text-blue-500 mb-1" />
                <p className="text-xs font-bold text-[var(--text-primary)]">Local Ollama</p>
                <p className="text-[10px] text-[var(--text-muted)]">Offline &amp; free</p>
              </button>

              <button
                type="button"
                onClick={() => setModelMode('cloud')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  modelMode === 'cloud'
                    ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                    : 'border-[var(--border-default)] bg-[var(--bg-canvas)]'
                }`}
              >
                <Sparkles size={16} className="text-purple-500 mb-1" />
                <p className="text-xs font-bold text-[var(--text-primary)]">Cloud API</p>
                <p className="text-[10px] text-[var(--text-muted)]">OpenAI / Groq</p>
              </button>

              <button
                type="button"
                onClick={() => setModelMode('skip')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  modelMode === 'skip'
                    ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                    : 'border-[var(--border-default)] bg-[var(--bg-canvas)]'
                }`}
              >
                <Radio size={16} className="text-amber-500 mb-1" />
                <p className="text-xs font-bold text-[var(--text-primary)]">Skip for Now</p>
                <p className="text-[10px] text-[var(--text-muted)]">Set up in Settings</p>
              </button>
            </div>

            {/* Option A: Ollama */}
            {modelMode === 'ollama' && (
              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--text-primary)]">
                    Ollama Base URL
                  </label>
                  <button
                    type="button"
                    onClick={handleDetectOllama}
                    disabled={detectingOllama}
                    className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {detectingOllama ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    <span>Auto-Detect Local Models</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                />

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Model Name
                  </label>
                  {detectedModels.length > 0 ? (
                    <select
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                    >
                      {detectedModels.map((m) => (
                        <option key={m} value={m}>{m} (Detected)</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="llama3.2 or mistral"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                    />
                  )}
                </div>

                {testStatus && (
                  <p className={`text-xs ${testStatus.success ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {testStatus.message}
                  </p>
                )}
              </div>
            )}

            {/* Option B: Cloud API */}
            {modelMode === 'cloud' && (
              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-3.5">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCloudBaseUrl('https://api.openai.com/v1')
                      setCloudModel('gpt-4o-mini')
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-xs font-semibold cursor-pointer text-center ${
                      cloudBaseUrl.includes('openai.com') ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-[var(--border-default)]'
                    }`}
                  >
                    OpenAI
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCloudBaseUrl('https://api.groq.com/openai/v1')
                      setCloudModel('llama-3.3-70b-versatile')
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-xs font-semibold cursor-pointer text-center ${
                      cloudBaseUrl.includes('groq.com') ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-[var(--border-default)]'
                    }`}
                  >
                    Groq
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCloudBaseUrl('https://integrate.api.nvidia.com/v1')
                      setCloudModel('meta/llama-3.2-3b-instruct')
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-xs font-semibold cursor-pointer text-center ${
                      cloudBaseUrl.includes('nvidia.com') ? 'border-purple-500 bg-purple-500/10 text-purple-500' : 'border-[var(--border-default)]'
                    }`}
                  >
                    NVIDIA NIM
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    API Base URL
                  </label>
                  <input
                    type="text"
                    value={cloudBaseUrl}
                    onChange={(e) => setCloudBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Model Identifier
                  </label>
                  <input
                    type="text"
                    value={cloudModel}
                    onChange={(e) => setCloudModel(e.target.value)}
                    placeholder="gpt-4o-mini or meta/llama-3.2-3b-instruct"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={cloudApiKey}
                    onChange={(e) => setCloudApiKey(e.target.value)}
                    placeholder="sk-... or nvapi-..."
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                  />
                </div>
              </div>
            )}

            {/* Option C: Skip */}
            {modelMode === 'skip' && (
              <div className="p-4 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-canvas)] text-center space-y-1">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  Running with Built-in Offline Synthesizer
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  You can connect Ollama, OpenAI, or custom LLM endpoints anytime in Workspace Settings.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-default)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>Next: Security &amp; Launch</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Security & Launch ── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Security Toggle: Demo Autofill */}
            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <KeyRound size={13} className="text-purple-500" />
                  Show Quick Demo Credentials on Login screen
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Uncheck this for shared or production setups to hide the "Fill Default Admin" shortcut button.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={allowDemoAutofill}
                  onChange={(e) => setAllowDemoAutofill(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-[var(--border-strong)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Configuration Summary Card */}
            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-canvas)] space-y-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Deployment Summary
              </span>
              <div className="text-xs text-[var(--text-secondary)] space-y-1">
                <p>
                  <strong>Admin User:</strong> {fullName} (<code className="font-mono">{email}</code>)
                </p>
                <p>
                  <strong>LLM Provider:</strong>{' '}
                  {modelMode === 'ollama'
                    ? `Local Ollama (${ollamaModel})`
                    : modelMode === 'cloud'
                    ? `Cloud API (${cloudModel})`
                    : 'Offline Synthesizer (Configurable in Settings)'}
                </p>
                <p>
                  <strong>Login Autofill:</strong> {allowDemoAutofill ? 'Enabled' : 'Disabled for security'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-default)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleCompleteSetup}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-60"
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                <span>Complete Setup &amp; Launch</span>
              </button>
            </div>
          </div>
        )}

        {/* Global Skip Link */}
        <div className="mt-6 pt-4 border-t border-[var(--border-default)] text-center">
          <button
            type="button"
            onClick={handleCompleteSetup}
            disabled={loading}
            className="text-xs text-[var(--text-muted)] hover:text-blue-500 font-medium transition-colors cursor-pointer"
          >
            Skip wizard &amp; launch with defaults (configure later in Settings)
          </button>
        </div>
      </div>
    </div>
  )
}
