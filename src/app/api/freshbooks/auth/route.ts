import { NextResponse } from 'next/server'
import { getFreshBooksAuthUrl } from '@/lib/freshbooks'

export async function GET() {
  const url = getFreshBooksAuthUrl()
  return NextResponse.redirect(url)
}
