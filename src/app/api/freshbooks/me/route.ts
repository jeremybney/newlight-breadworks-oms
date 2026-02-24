import { NextResponse } from 'next/server'
import { getValidAccessToken } from '@/lib/freshbooks-tokens'

export async function GET() {
  try {
    const accessToken = await getValidAccessToken()
    const res = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
