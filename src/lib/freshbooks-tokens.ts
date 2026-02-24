// Stores FreshBooks OAuth tokens in Firestore so they persist across deploys
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { FreshBooksTokens, refreshTokens } from './freshbooks'

const TOKEN_DOC = 'config/freshbooks_tokens'

export async function getStoredTokens(): Promise<FreshBooksTokens | null> {
  try {
    const snap = await getDoc(doc(db, 'config', 'freshbooks_tokens'))
    if (!snap.exists()) return null
    return snap.data() as FreshBooksTokens
  } catch {
    return null
  }
}

export async function storeTokens(tokens: FreshBooksTokens): Promise<void> {
  await setDoc(doc(db, 'config', 'freshbooks_tokens'), tokens)
}

// Returns a valid access token, refreshing if expired
export async function getValidAccessToken(): Promise<string> {
  const tokens = await getStoredTokens()
  if (!tokens) throw new Error('FreshBooks not connected. Visit /api/freshbooks/auth to connect.')

  // Refresh if expiring within 5 minutes
  if (Date.now() > tokens.expires_at - 5 * 60 * 1000) {
    const refreshed = await refreshTokens(tokens.refresh_token)
    await storeTokens(refreshed)
    return refreshed.access_token
  }

  return tokens.access_token
}
