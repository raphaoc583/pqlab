export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId: string
}

export interface GitHubOAuthConfig {
  clientId: string
}

export interface RuntimeConfig {
  firebase?: FirebaseConfig
  github_oauth?: GitHubOAuthConfig
}

let _config: RuntimeConfig = {}

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch('./config.json?v=' + Date.now())
    if (!res.ok) return
    const raw: RuntimeConfig & { _instrucoes?: string } = await res.json()

    const next: RuntimeConfig = {}

    const fb = raw.firebase
    if (fb?.apiKey?.trim() && fb?.projectId?.trim() && fb?.authDomain?.trim()) {
      next.firebase = fb
    }

    const gh = raw.github_oauth
    if (gh?.clientId?.trim()) {
      next.github_oauth = { clientId: gh.clientId.trim() }
    }

    _config = next
  } catch {
    // absent or malformed
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  return _config
}

export function isFirebaseConfigured(): boolean {
  return !!_config.firebase
}

export function isGitHubOAuthConfigured(): boolean {
  return !!_config.github_oauth?.clientId
}

export function getGitHubOAuthClientId(): string | undefined {
  return _config.github_oauth?.clientId
}
