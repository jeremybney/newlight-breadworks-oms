'use client'
// Email inbox list for the PO Importer. Shows the order emails the server has picked up from the
// admin@ mailbox (collection "poEmails"). "Open preview" loads an email into the same read-only
// preview as a dropped file. The only thing this panel can change is an email's own inbox status
// ("Mark as ignored"). It never creates or changes orders.
import { useCallback, useEffect, useState } from 'react'
import { collection, doc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Inbox, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

interface Row {
  id: string
  status: string
  kind: string
  subject: string
  receivedAt: string | null
  receivedLocal: string | null
  poNumber: string | null
  location: string | null
  itemCount: number | null
  notes: string[]
  raw: string | null
  fileName: string | null
  duplicateOf: string | null
  handledBy: string | null
  orderId?: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-blue-100 text-blue-800' },
  needs_attention: { label: 'Needs attention', cls: 'bg-amber-100 text-amber-900' },
  ignored: { label: 'Ignored', cls: 'bg-gray-100 text-gray-600' },
  order_created: { label: 'Order created', cls: 'bg-green-100 text-green-800' },
  duplicate: { label: 'Duplicate', cls: 'bg-gray-100 text-gray-600' },
  creating: { label: 'Creating…', cls: 'bg-amber-100 text-amber-900' },
}

export default function InboxPanel({ adminEmail, version, onOpen, openIds, onClose, renderOpen }: {
  adminEmail: string; version: number; onOpen: (file: File, inboxId: string) => void
  openIds: string[]; onClose: (inboxId: string) => void; renderOpen: (inboxId: string) => ReactNode
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showIgnored, setShowIgnored] = useState(false)
  const [showHandled, setShowHandled] = useState(false)
  const [loadedAt, setLoadedAt] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const snap = await getDocs(query(collection(db, 'poEmails'), orderBy('receivedAt', 'desc'), limit(300)))
      setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
      setLoadedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
    } catch (e: any) {
      setError(`Could not read the email inbox: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load, version])

  const open = (r: Row) => {
    if (!r.raw) return
    const bytes = Uint8Array.from(atob(r.raw), c => c.charCodeAt(0))
    onOpen(new File([bytes], `${r.subject || r.id}.eml`, { type: 'message/rfc822' }), r.id)
  }

  const ignore = async (r: Row) => {
    if (!window.confirm(`Mark this email as ignored?\n\n${r.subject}`)) return
    try {
      await updateDoc(doc(db, 'poEmails', r.id), { status: 'ignored', handledBy: adminEmail, handledAt: new Date().toISOString() })
      setRows(prev => prev.map(x => (x.id === r.id ? { ...x, status: 'ignored', handledBy: adminEmail } : x)))
    } catch (e: any) {
      setError(`Could not update the email: ${e?.message || e}`)
    }
  }

  // Default view = the work queue: New, Needs attention and in-progress rows only.
  // "Show handled" adds Order created and Duplicate rows; "Show ignored" adds Ignored rows.
  // A row whose preview is open always stays in the list (even after its order is created), so the preview stays under it.
  const visible = rows.filter(r => {
    if (openIds.includes(r.id)) return true
    if (r.status === 'ignored') return showIgnored
    if (r.status === 'order_created' || r.status === 'duplicate') return showHandled
    return true
  })
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {})

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-semibold text-bark-900">
          <Inbox className="w-4 h-4" /> Email inbox
          <span className="text-xs font-normal text-bark-800/60">
            {counts.new || 0} new · {counts.needs_attention || 0} need attention · {(counts.order_created || 0) + (counts.duplicate || 0)} handled
            {loadedAt && ` · loaded ${loadedAt}`}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1 text-bark-800/70">
            <input type="checkbox" checked={showHandled} onChange={e => setShowHandled(e.target.checked)} /> Show handled
          </label>
          <label className="flex items-center gap-1 text-bark-800/70">
            <input type="checkbox" checked={showIgnored} onChange={e => setShowIgnored(e.target.checked)} /> Show ignored
          </label>
          <button className="btn-ghost text-xs py-1.5 flex items-center gap-1" onClick={load} disabled={loading}>
            <RefreshCw className="w-3 h-3" /> {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="mt-3 p-2 rounded border border-red-300 bg-red-50 text-sm text-red-800">{error}</div>}
      {!error && !loading && visible.length === 0 && (
        <div className="mt-3 text-sm text-bark-800/60">
          {rows.length > 0 ? 'Nothing needs your attention. Tick Show handled to see orders already created.' : 'No emails to show yet.'} New Maman, Westville and FreshDirect orders appear here within about 15 minutes of arriving.
        </div>
      )}

      <div className="mt-3 divide-y divide-wheat-300/40">
        {visible.map(r => {
          const st = STATUS[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-700' }
          const isOpen = openIds.includes(r.id)
          return (
            <div key={r.id} className="py-2">
            <div className="flex gap-3 items-start text-sm">
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-bark-900 truncate">{r.subject || '(no subject)'}</div>
                <div className="text-xs text-bark-800/60">
                  {r.receivedLocal || r.receivedAt || ''}
                  {r.poNumber && ` · PO ${r.poNumber}`}
                  {r.itemCount !== null && r.itemCount !== undefined && ` · ${r.itemCount} ${r.kind === 'maman' ? 'rows' : 'lines'}`}
                  {r.orderId && ` · order ${r.orderId}`}
                  {r.handledBy && ` · handled by ${r.handledBy}`}
                </div>
                {r.status !== 'new' && r.notes?.length > 0 && (
                  <div className="text-xs text-bark-800/70 mt-0.5">{r.notes.slice(0, 2).join(' ')}</div>
                )}
              </div>
              <div className="shrink-0 flex gap-2">
                {isOpen ? (
                  <button className="btn-secondary text-xs py-1" onClick={() => onClose(r.id)}>Close preview</button>
                ) : (
                  r.raw && r.status !== 'ignored' && r.status !== 'duplicate' && (
                    <button className="btn-secondary text-xs py-1" onClick={() => open(r)}>Open preview</button>
                  )
                )}
                {(r.status === 'new' || r.status === 'needs_attention') && (
                  <button className="btn-ghost text-xs py-1" onClick={() => ignore(r)}>Mark ignored</button>
                )}
              </div>
            </div>
            {isOpen && <div className="mt-3">{renderOpen(r.id)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
