import { NextRequest, NextResponse } from 'next/server'
import { parseOvenCsv, OvenLoad } from '@/lib/oven'

// Reads the crew's oven log (Google Sheet tabs published to the web as CSV) and returns one day's loads.
// Only Google "publish to web" links are fetched, so this cannot be pointed at anything else.
export const dynamic = 'force-dynamic'

function allowed(u: string): boolean {
  try {
    const x = new URL(u)
    return x.protocol === 'https:' && x.hostname === 'docs.google.com' &&
      x.pathname.startsWith('/spreadsheets/d/e/') && x.searchParams.get('output') === 'csv'
  } catch { return false }
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || ''
  const urls = req.nextUrl.searchParams.getAll('u').slice(0, 4)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  const loads: OvenLoad[] = []
  const errors: string[] = []
  await Promise.all(urls.map(async (u, i) => {
    if (!allowed(u)) { errors.push(`Link ${i + 1} is not a Google Sheets published CSV link.`); return }
    try {
      const res = await fetch(u, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(8000) })
      if (!res.ok) { errors.push(`Link ${i + 1} could not be read (${res.status}).`); return }
      const parsed = parseOvenCsv(await res.text())
      if (!parsed) { errors.push(`Link ${i + 1} does not look like the rack or deck oven tab (its column headings changed?).`); return }
      loads.push(...parsed.loads.filter(l => l.date === date))
    } catch {
      errors.push(`Link ${i + 1} could not be read.`)
    }
  }))
  loads.sort((a, b) => a.start.localeCompare(b.start))
  return NextResponse.json({ loads, errors })
}
