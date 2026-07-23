// Stores FreshBooks OAuth tokens in Firestore using Firebase Admin SDK
// Admin SDK authenticates via service account — bypasses Firestore security rules
// Required because this runs server-side with no logged-in user attached

import { FreshBooksTokens, refreshTokens } from './freshbooks'

// Lazily initialise the Admin SDK so it only runs server-side
function getAdminDb() {
  // Dynamic require so Next.js doesn't try to bundle this for the browser
  const admin = require('firebase-admin')

  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY!
    )
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  }

  return admin.firestore()
}

export async function getStoredTokens(): Promise<FreshBooksTokens | null> {
  try {
    const db = getAdminDb()
    const snap = await db.collection('config').doc('freshbooks_tokens').get()
    if (!snap.exists) return null
    return snap.data() as FreshBooksTokens
  } catch (e) {
    console.error('getStoredTokens error:', e)
    return null
  }
}

export async function storeTokens(tokens: FreshBooksTokens): Promise<void> {
  const db = getAdminDb()
  await db.collection('config').doc('freshbooks_tokens').set(tokens)
}

// Returns a valid access token, refreshing if expired
export async function getValidAccessToken(): Promise<string> {
  const tokens = await getStoredTokens()
  if (!tokens) throw new Error('FreshBooks not connected. Visit /admin to connect.')

  // Refresh if expiring within 5 minutes
  if (Date.now() > tokens.expires_at - 5 * 60 * 1000) {
    const refreshed = await refreshTokens(tokens.refresh_token)
    await storeTokens(refreshed)
    return refreshed.access_token
  }

  return tokens.access_token
}
