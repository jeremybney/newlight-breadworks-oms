import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/freshbooks'
import { storeTokens } from '@/lib/freshbooks-tokens'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(
      `https://newlightbread.netlify.app/admin?freshbooks=error&reason=${error || 'no_code'}`
    )
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    await storeTokens(tokens)
    return NextResponse.redirect(
      `https://newlightbread.netlify.app/admin?freshbooks=connected`
    )
  } catch (err: any) {
    console.error('FreshBooks callback error:', err)
    return NextResponse.redirect(
      `https://newlightbread.netlify.app/admin?freshbooks=error&reason=${encodeURIComponent(err.message)}`
    )
  }
}
