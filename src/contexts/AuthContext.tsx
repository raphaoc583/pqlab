import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User as FbUser,
} from 'firebase/auth'
import { isFirebaseReady, getFirebaseAuth, getGoogleProvider } from '@/lib/firebase'
import {
  getGitHubConfig,
  saveGitHubConfig,
  clearGitHubConfig,
  isGitHubConfigured,
  setGitHubConfigKey,
  testConnection,
  type GitHubConfig,
} from '@/lib/github'
import { isGitHubOAuthConfigured, getGitHubOAuthClientId } from '@/lib/config'
import { requestDeviceCode, pollForToken, type DeviceCodeResponse } from '@/lib/githubDeviceFlow'

export interface AppUser {
  id: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export interface DeviceFlowSession {
  userCode: string
  verificationUri: string
  expiresIn: number
  cancel: () => void
  tokenPromise: Promise<string>
}

interface AuthContextType {
  user: AppUser | null
  loading: boolean
  /** true when data is read from in-memory demo set (no GitHub writes) */
  isDemoMode: boolean
  /** true when a GitHub PAT is configured and ready for reads/writes */
  githubReady: boolean
  /** true when Firebase is available (Google login is possible) */
  firebaseEnabled: boolean
  /** true when GitHub OAuth App client_id is configured in config.json */
  githubOAuthEnabled: boolean
  signInWithGoogle: () => Promise<void>
  /** Start GitHub Device Authorization Flow — returns session data for UI display */
  startDeviceFlow: () => Promise<DeviceFlowSession>
  configureGitHub: (
    cfg: Omit<GitHubConfig, 'branch'> & { branch?: string }
  ) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

const DEMO_USER: AppUser = {
  id: 'demo-user-id',
  email: 'demo@pqlab.app',
  displayName: 'Usuário Demo',
  photoURL: null,
}

function fbUserToAppUser(u: FbUser): AppUser {
  return {
    id: u.uid,
    email: u.email,
    displayName: u.displayName,
    photoURL: u.photoURL,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [githubReady, setGithubReady] = useState(false)
  const [loading, setLoading] = useState(true)

  const firebaseEnabled = isFirebaseReady()
  const githubOAuthEnabled = isGitHubOAuthConfigured()

  useEffect(() => {
    const auth = getFirebaseAuth()

    if (!auth) {
      if (isGitHubConfigured()) {
        const cfg = getGitHubConfig()!
        setUser({
          id: 'github-user',
          email: `${cfg.owner}/${cfg.repo}`,
          displayName: 'GitHub User',
          photoURL: null,
        })
        setGithubReady(true)
      } else if (localStorage.getItem('pqlab_demo_logged_in') === 'true') {
        setUser(DEMO_USER)
      }
      setLoading(false)
      return
    }

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setGitHubConfigKey(fbUser.uid)
        setUser(fbUserToAppUser(fbUser))
        setGithubReady(isGitHubConfigured())
      } else {
        setGitHubConfigKey(null)
        setUser(null)
        setGithubReady(false)
      }
      setLoading(false)
    })

    return unsub
  }, [])

  const isDemoMode = user?.id === 'demo-user-id'

  // ── GitHub Device Flow ───────────────────────────────────────────────────

  async function startDeviceFlow(): Promise<DeviceFlowSession> {
    const clientId = getGitHubOAuthClientId()
    if (!clientId) throw new Error('GitHub OAuth não está configurado.')

    const deviceData: DeviceCodeResponse = await requestDeviceCode(clientId)
    const controller = new AbortController()

    const tokenPromise = pollForToken(
      clientId,
      deviceData.device_code,
      deviceData.interval,
      controller.signal
    )

    return {
      userCode: deviceData.user_code,
      verificationUri: deviceData.verification_uri,
      expiresIn: deviceData.expires_in,
      cancel: () => controller.abort(),
      tokenPromise,
    }
  }

  async function signInWithGoogle(): Promise<void> {
    const auth = getFirebaseAuth()
    const provider = getGoogleProvider()
    if (auth && provider) {
      await signInWithPopup(auth, provider)
    } else {
      localStorage.setItem('pqlab_demo_logged_in', 'true')
      setUser(DEMO_USER)
      setGithubReady(false)
    }
  }

  async function configureGitHub(
    cfgInput: Omit<GitHubConfig, 'branch'> & { branch?: string }
  ): Promise<{ ok: boolean; error?: string }> {
    const full: GitHubConfig = { branch: 'main', ...cfgInput }
    const result = await testConnection(full)
    if (!result.ok) return result
    saveGitHubConfig(full)
    setGithubReady(true)
    if (!firebaseEnabled || !user) {
      setUser({
        id: 'github-user',
        email: `${full.owner}/${full.repo}`,
        displayName: 'GitHub User',
        photoURL: null,
      })
    }
    return { ok: true }
  }

  async function signOut(): Promise<void> {
    const auth = getFirebaseAuth()
    clearGitHubConfig()
    setGithubReady(false)
    if (auth) {
      await fbSignOut(auth)
    } else {
      localStorage.removeItem('pqlab_demo_logged_in')
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDemoMode,
        githubReady,
        firebaseEnabled,
        githubOAuthEnabled,
        signInWithGoogle,
        startDeviceFlow,
        configureGitHub,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
