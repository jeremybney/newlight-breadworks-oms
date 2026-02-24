import { NextResponse } from 'next/server'
import { getStoredTokens } from '@/lib/freshbooks-tokens'

export async function GET() {
  try {
    const tokens = await getStoredTokens()
    if (!tokens) return NextResponse.json({ connected: false })
    // Consider connected if token exists and isn't expired
    const connected = Date.now() < tokens.expires_at || !!tokens.refresh_token
    return NextResponse.json({ connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
