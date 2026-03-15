// ─── GitHub Device Authorization Flow (RFC 8628) ─────────────────────────
// Permite login sem digitar PAT: o usuário vê um código curto no app,
// acessa github.com/login/device e autoriza. O app recebe o token OAuth.
//
// Não exige client_secret — apenas o client_id público do OAuth App.

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const OAUTH_SCOPE = 'repo'

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string
  user_code: string          // ex: "XXXX-YYYY" — mostrado ao usuário
  verification_uri: string   // "https://github.com/login/device"
  expires_in: number         // segundos até o código expirar
  interval: number           // segundos entre cada poll
}

// ─── Passo 1: solicitar código de dispositivo ─────────────────────────────

export async function requestDeviceCode(clientId: string): Promise<DeviceCodeResponse> {
  const res = await fetch(
    `${GITHUB_DEVICE_CODE_URL}?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(OAUTH_SCOPE)}`,
    {
      method: 'POST',
      headers: { Accept: 'application/json' },
    }
  )

  if (!res.ok) {
    throw new Error(`GitHub retornou ${res.status} ao solicitar código de dispositivo.`)
  }

  const data = await res.json()

  if (data.error) {
    throw new Error(data.error_description ?? data.error)
  }

  return data as DeviceCodeResponse
}

// ─── Passo 2: polling até obter o token ───────────────────────────────────

export async function pollForToken(
  clientId: string,
  deviceCode: string,
  initialIntervalSecs: number,
  signal: AbortSignal
): Promise<string> {
  let intervalSecs = initialIntervalSecs

  while (true) {
    if (signal.aborted) {
      throw new DOMException('Cancelado pelo usuário.', 'AbortError')
    }

    await sleep(intervalSecs * 1000)

    if (signal.aborted) {
      throw new DOMException('Cancelado pelo usuário.', 'AbortError')
    }

    const res = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    const data = await res.json()

    if (data.access_token) {
      return data.access_token as string
    }

    switch (data.error) {
      case 'authorization_pending':
        // Normal — usuário ainda não autorizou
        break

      case 'slow_down':
        // GitHub pede para reduzir a frequência
        intervalSecs += 5
        break

      case 'expired_token':
        throw new Error('O código de verificação expirou. Tente novamente.')

      case 'access_denied':
        throw new Error('Autorização negada pelo usuário.')

      default:
        if (data.error) {
          throw new Error(data.error_description ?? data.error)
        }
    }
  }
}

// ─── Utilitário ───────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
