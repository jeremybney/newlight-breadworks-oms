import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.NEXT_PUBLIC_ZAPIER_WEBHOOK_URL

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Zapier webhook URL not configured' }, { status: 500 })
  }

  try {
    const payload = await request.json()

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      return NextResponse.json({ success: true })
    } else {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
