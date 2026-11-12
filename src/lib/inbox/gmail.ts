// Minimal read-only Gmail client (plain fetch, no extra packages).
// Uses the three GMAIL_* settings stored in Netlify. Scope is gmail.readonly, so this code
// can list and read messages but cannot send, delete, label or change anything.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing Netlify setting ${name}`)
  return v.trim()
}

let cached: { token: string; expires: number } | null = null

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GMAIL_CLIENT_ID'),
      client_secret: env('GMAIL_CLIENT_SECRET'),
      refresh_token: env('GMAIL_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) {
    // Never log the token values, only Google's error code.
    throw new Error(`Google sign-in failed (${res.status}): ${json.error || 'unknown'} ${json.error_description || ''}`.trim())
  }
  cached = { token: json.access_token, expires: Date.now() + (json.expires_in || 3600) * 1000 }
  return cached.token
}

async function api(path: string): Promise<any> {
  const token = await getAccessToken()
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${json?.error?.message || 'request failed'}`)
  return json
}

export async function listMessageIds(query: string, max = 50): Promise<string[]> {
  const ids: string[] = []
  let pageToken = ''
  while (ids.length < max) {
    const q = new URLSearchParams({ q: query, maxResults: String(Math.min(100, max - ids.length)) })
    if (pageToken) q.set('pageToken', pageToken)
    const json = await api(`/messages?${q.toString()}`)
    for (const m of json.messages || []) ids.push(m.id)
    pageToken = json.nextPageToken || ''
    if (!pageToken) break
  }
  return ids
}

// The whole original email (headers, body and attachments) as bytes, same as a downloaded .eml file.
export async function getRawMessage(id: string): Promise<Uint8Array> {
  const json = await api(`/messages/${encodeURIComponent(id)}?format=raw`)
  const b64 = String(json.raw || '').replace(/-/g, '+').replace(/_/g, '/')
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

export interface MessageMeta { id: string; subject: string; from: string; receivedAt: string | null }

// Just the subject, sender and arrival time (no body, no attachments).
export async function getMessageMeta(id: string): Promise<MessageMeta> {
  const json = await api(`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`)
  const header = (n: string) => (json.payload?.headers || []).find((h: any) => String(h.name).toLowerCase() === n)?.value || ''
  const ms = Number(json.internalDate)
  return { id, subject: header('subject'), from: header('from'), receivedAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null }
}
