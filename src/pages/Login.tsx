import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import {
  GraduationCap,
  Github,
  KeyRound,
  Eye,
  EyeOff,
  LogIn,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DeviceFlowSession } from '@/contexts/AuthContext'

// ─── GitHub config form (shared between two flows) ───────────────────────

function GitHubConfigForm({
  onSuccess,
  subtitle,
  initialOwner = '',
  initialRepo = '',
  showTokenField = true,
}: {
  onSuccess?: () => void
  subtitle?: string
  initialOwner?: string
  initialRepo?: string
  showTokenField?: boolean
}) {
  const { configureGitHub } = useAuth()
  const [token, setToken] = useState('')
  const [owner, setOwner] = useState(initialOwner)
  const [repo, setRepo] = useState(initialRepo)
  const [branch, setBranch] = useState('main')
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setOwner(initialOwner) }, [initialOwner])
  useEffect(() => { setRepo(initialRepo) }, [initialRepo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (showTokenField && !token.trim()) {
      setError('Token é obrigatório.')
      return
    }
    if (!owner.trim() || !repo.trim()) {
      setError('Usuário e repositório são obrigatórios.')
      return
    }
    setError(null)
    setTesting(true)
    const result = await configureGitHub({
      token: token.trim(),
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
    })
    setTesting(false)
    if (!result.ok) {
      setError(result.error ?? 'Não foi possível conectar. Verifique as credenciais.')
    } else {
      onSuccess?.()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}

      <div className="flex items-center gap-2">
        <Github className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-semibold text-gray-700">Configurar repositório GitHub</span>
      </div>

      {showTokenField && (
        <div className="space-y-1.5">
          <Label htmlFor="gh-token">Personal Access Token (PAT)</Label>
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              id="gh-token"
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxx"
              className="pl-9 pr-9 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowToken((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Escopo mínimo: <code className="bg-gray-100 px-1 rounded">repo</code>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gh-owner">Usuário / Org</Label>
          <Input
            id="gh-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="seu-usuario"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gh-repo">Repositório</Label>
          <Input
            id="gh-repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="pqlab-dados"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gh-branch">
          Branch <span className="text-gray-400 font-normal">(padrão: main)</span>
        </Label>
        <Input
          id="gh-branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={testing}>
        <Github className="w-4 h-4" />
        {testing ? 'Conectando...' : 'Conectar e entrar'}
      </Button>
    </form>
  )
}

// ─── Device Flow panel ────────────────────────────────────────────────────

function DeviceFlowPanel({
  session,
  onCancel,
  onToken,
}: {
  session: DeviceFlowSession
  onCancel: () => void
  onToken: (token: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const handledRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    session.tokenPromise
      .then((token) => {
        if (!handledRef.current) {
          handledRef.current = true
          onToken(token)
        }
      })
      .catch((err) => {
        if (!handledRef.current) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setError(err.message ?? 'Erro ao obter token.')
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(session.userCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const remaining = Math.max(session.expiresIn - elapsed, 0)
  const progress = Math.min((elapsed / session.expiresIn) * 100, 100)
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700 text-center">Código de verificação</p>

        <div className="flex items-center justify-center gap-3">
          <span className="font-mono text-3xl font-bold tracking-widest text-gray-900 bg-white border-2 border-green-200 rounded-xl px-5 py-3 select-all">
            {session.userCode}
          </span>
          <button
            onClick={handleCopy}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-500"
            title="Copiar código"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
          <li>
            Acesse{' '}
            <a
              href={session.verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 hover:underline inline-flex items-center gap-1"
            >
              github.com/login/device
              <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>Digite o código acima</li>
          <li>Clique em <strong>Authorize pqLAB</strong></li>
        </ol>

        <div className="space-y-1">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-1000"
              style={{ width: `${100 - progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Aguardando autorização...
            </span>
            <span>{mins > 0 ? `${mins}m ` : ''}{secs}s</span>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      <Button variant="outline" className="w-full" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  )
}

// ─── PAT toggle (collapsible fallback) ───────────────────────────────────

function PATToggle({ initialOwner = '', initialRepo = '' }: { initialOwner?: string; initialRepo?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          Configurar com PAT manualmente
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-4">
            <GitHubConfigForm initialOwner={initialOwner} initialRepo={initialRepo} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Login component ─────────────────────────────────────────────────

export function Login() {
  const {
    user,
    loading,
    isDemoMode,
    githubReady,
    firebaseEnabled,
    githubOAuthEnabled,
    signInWithGoogle,
    startDeviceFlow,
    configureGitHub,
  } = useAuth()

  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const [deviceSession, setDeviceSession] = useState<DeviceFlowSession | null>(null)
  const [deviceLoading, setDeviceLoading] = useState(false)
  const [deviceError, setDeviceError] = useState<string | null>(null)

  const [oauthToken, setOauthToken] = useState<string | null>(null)
  const [oauthOwner, setOauthOwner] = useState('')
  const [oauthRepo, setOauthRepo] = useState('')
  const [oauthBranch, setOauthBranch] = useState('main')
  const [oauthConnecting, setOauthConnecting] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  if (!loading && (githubReady || isDemoMode)) {
    return <Navigate to="/diario" replace />
  }

  // ── Google ─────────────────────────────────────────────────────────────

  async function handleGoogleSignIn() {
    setGoogleError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao entrar com Google.'
      setGoogleError(msg)
    } finally {
      setGoogleLoading(false)
    }
  }

  // ── Device Flow ────────────────────────────────────────────────────────

  async function handleStartDeviceFlow() {
    setDeviceError(null)
    setDeviceLoading(true)
    try {
      const session = await startDeviceFlow()
      setDeviceSession(session)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar autenticação.'
      setDeviceError(msg)
    } finally {
      setDeviceLoading(false)
    }
  }

  function handleCancelDeviceFlow() {
    deviceSession?.cancel()
    setDeviceSession(null)
    setDeviceError(null)
  }

  async function handleDeviceToken(token: string) {
    setDeviceSession(null)
    setOauthToken(token)

    // Try to auto-connect using previously saved owner/repo
    const stored = (() => {
      try {
        const raw = localStorage.getItem('pqlab_github_config')
        if (raw) return JSON.parse(raw) as { owner?: string; repo?: string; branch?: string }
      } catch {}
      return null
    })()

    if (stored?.owner && stored?.repo) {
      setOauthConnecting(true)
      const result = await configureGitHub({
        token,
        owner: stored.owner,
        repo: stored.repo,
        branch: stored.branch ?? 'main',
      })
      setOauthConnecting(false)
      if (!result.ok) {
        setOauthOwner(stored.owner)
        setOauthRepo(stored.repo)
        setOauthBranch(stored.branch ?? 'main')
        setOauthError(result.error ?? 'Não foi possível conectar com o repositório salvo.')
      }
    } else {
      setOauthOwner('')
      setOauthRepo('')
      setOauthBranch('main')
    }
  }

  async function handleOauthRepoSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!oauthToken) return
    if (!oauthOwner.trim() || !oauthRepo.trim()) {
      setOauthError('Usuário e repositório são obrigatórios.')
      return
    }
    setOauthError(null)
    setOauthConnecting(true)
    const result = await configureGitHub({
      token: oauthToken,
      owner: oauthOwner.trim(),
      repo: oauthRepo.trim(),
      branch: oauthBranch.trim() || 'main',
    })
    setOauthConnecting(false)
    if (!result.ok) {
      setOauthError(result.error ?? 'Não foi possível conectar.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center mb-4 shadow-lg shadow-green-200">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">pqLAB</h1>
            <p className="text-sm text-gray-500 mt-1">App de gestão de rotinas de pesquisa · por coLAB-UFF</p>
          </div>

          {/* ── Scenario A: Firebase user logged in, needs GitHub config ─── */}
          {user && !isDemoMode && !githubReady && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <UserCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-green-800">
                    {user.displayName ?? user.email}
                  </p>
                  <p className="text-xs text-green-600 truncate">{user.email}</p>
                </div>
              </div>
              <GitHubConfigForm
                subtitle="Para salvar seus dados, conecte um repositório GitHub privado."
              />
            </div>
          )}

          {/* ── Scenario B: not logged in yet ─────────────────────────── */}
          {!user && (
            <>
              {/* Google Sign-In */}
              {firebaseEnabled && (
                <>
                  {googleError && (
                    <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700">{googleError}</p>
                    </div>
                  )}
                  <Button
                    className="w-full mb-4 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 shadow-sm"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" aria-hidden>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {googleLoading ? 'Entrando...' : 'Entrar com Google'}
                  </Button>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs text-gray-400 bg-white px-2">ou</div>
                  </div>
                </>
              )}

              {/* GitHub OAuth Device Flow */}
              {githubOAuthEnabled && !oauthToken && (
                <div className="space-y-4">
                  {deviceError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700">{deviceError}</p>
                    </div>
                  )}

                  {deviceSession ? (
                    <DeviceFlowPanel
                      session={deviceSession}
                      onCancel={handleCancelDeviceFlow}
                      onToken={handleDeviceToken}
                    />
                  ) : (
                    <Button
                      className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                      onClick={handleStartDeviceFlow}
                      disabled={deviceLoading}
                    >
                      {deviceLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0" aria-hidden>
                          <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.462-1.11-1.462-.908-.620.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.026A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.295 2.747-1.026 2.747-1.026.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/>
                        </svg>
                      )}
                      {deviceLoading ? 'Iniciando...' : 'Entrar com GitHub'}
                    </Button>
                  )}

                  {!deviceSession && (
                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-xs text-gray-400 bg-white px-2">ou</div>
                    </div>
                  )}
                </div>
              )}

              {/* After OAuth: repo form / auto-connecting */}
              {githubOAuthEnabled && oauthToken && (
                <div className="space-y-4">
                  {oauthConnecting ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Conectando ao repositório...
                    </div>
                  ) : (
                    <form onSubmit={handleOauthRepoSubmit} className="space-y-4">
                      <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg border border-green-200">
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <p className="text-sm text-green-700 font-medium">GitHub autorizado com sucesso</p>
                      </div>

                      <p className="text-sm text-gray-500">
                        Indique o repositório onde seus dados estão armazenados.
                      </p>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="oa-owner">Usuário / Org</Label>
                          <Input
                            id="oa-owner"
                            value={oauthOwner}
                            onChange={(e) => setOauthOwner(e.target.value)}
                            placeholder="seu-usuario"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="oa-repo">Repositório</Label>
                          <Input
                            id="oa-repo"
                            value={oauthRepo}
                            onChange={(e) => setOauthRepo(e.target.value)}
                            placeholder="pqlab-dados"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="oa-branch">
                          Branch <span className="text-gray-400 font-normal">(padrão: main)</span>
                        </Label>
                        <Input
                          id="oa-branch"
                          value={oauthBranch}
                          onChange={(e) => setOauthBranch(e.target.value)}
                          placeholder="main"
                        />
                      </div>

                      {oauthError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-sm text-red-700">{oauthError}</p>
                        </div>
                      )}

                      <Button type="submit" className="w-full" disabled={oauthConnecting}>
                        <Github className="w-4 h-4" />
                        Conectar repositório
                      </Button>

                      <button
                        type="button"
                        className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        onClick={() => { setOauthToken(null); setOauthError(null) }}
                      >
                        ← Voltar e usar outra conta GitHub
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* PAT form: primary when OAuth is disabled */}
              {!githubOAuthEnabled && (
                <>
                  <GitHubConfigForm />
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs text-gray-400 bg-white px-2">ou</div>
                  </div>
                </>
              )}

              {/* PAT collapsible toggle when OAuth is enabled */}
              {githubOAuthEnabled && !oauthToken && !deviceSession && (
                <PATToggle />
              )}

              {/* Demo mode button */}
              {!oauthToken && !deviceSession && (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={signInWithGoogle}
                  >
                    <LogIn className="w-4 h-4" />
                    Modo demonstração
                  </Button>
                  <p className="text-xs text-gray-400 text-center mt-2">
                    Dados fictícios, sem persistência.
                  </p>
                </>
              )}
            </>
          )}
        </div>

        {/* Setup hint */}
        <div className="bg-white/80 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-700">Primeira configuração</p>
          <ol className="list-decimal list-inside space-y-1 leading-relaxed">
            {firebaseEnabled && (
              <li>Clique em <strong>Entrar com Google</strong> para se identificar.</li>
            )}
            {githubOAuthEnabled && (
              <li>Clique em <strong>Entrar com GitHub</strong>, autorize o app e informe seu repositório.</li>
            )}
            {!githubOAuthEnabled && !firebaseEnabled && (
              <>
                <li>Crie um repositório <strong>privado</strong> no GitHub para seus dados.</li>
                <li>
                  Gere um PAT em <em>Settings → Developer settings → Personal access tokens</em>{' '}
                  com escopo <code className="bg-gray-100 px-1 rounded">repo</code>.
                </li>
                <li>Preencha as credenciais e clique em Conectar.</li>
              </>
            )}
          </ol>
        </div>

        <p className="text-center text-xs text-gray-400">
          pqLAB · dados armazenados no seu GitHub
        </p>
      </div>
    </div>
  )
}
