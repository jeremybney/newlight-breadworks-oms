'use client'
// PO Importer v1: READ-ONLY preview.
// Upload a Maman CSV or Westville PDF purchase order, see the proposed OMS order and every warning.
// This page only READS customers and products. It never writes to Firebase, never creates orders
// or invoices, and does not touch recurring orders or production data. Corrections made here
// (customer, product, slicing, dates) live only in this browser tab.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useAuth } from '@/lib/auth-context'
import { customersService } from '@/lib/db'
import { productsService } from '@/lib/products-dynamic'
import { PRODUCTS as STATIC_PRODUCTS } from '@/lib/products'
import { Customer, Product } from '@/types'
import { ParsedPo, PreviewInput, PreviewLine, PreviewOrder, Issue } from '@/lib/poimport/types'
import { looksLikeMamanCsv, parseMamanCsv } from '@/lib/poimport/maman'
import { looksLikeWestvillePo, parseWestvillePo } from '@/lib/poimport/westville'
import { extractPdfItems } from '@/lib/poimport/pdfText'
import { parseOrderEmail } from '@/lib/poimport/email'
import { SLICING_OPTIONS, allIssues, blockingCount, buildPreview } from '@/lib/poimport/build'
import { AlertTriangle, CheckCircle, Info, Lock, Upload, X } from 'lucide-react'
import InboxPanel from './InboxPanel'

interface ImportItem {
  id: string
  fileName: string
  parsed: ParsedPo | null
  error: string | null
  input: PreviewInput
}

let seq = 0
const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `$${n.toFixed(2)}`)

export default function PoImportPage() {
  const { appUser } = useAuth()
  const isAdmin = appUser?.role === 'admin'

  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [dataNote, setDataNote] = useState('')
  const [dataError, setDataError] = useState('')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ImportItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Read-only load of live customers and products.
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    ;(async () => {
      try {
        const [c, p] = await Promise.all([customersService.getAll(), productsService.getAll()])
        if (cancelled) return
        const dbIds = new Set(p.map(x => x.id))
        const builtInOnly = STATIC_PRODUCTS.filter(x => !dbIds.has(x.id))
        setCustomers(c)
        setProducts([...p, ...builtInOnly])
        setDataNote(`${c.length} customers and ${p.length} products read from the database` +
          (builtInOnly.length ? ` (+${builtInOnly.length} built-in products not yet in the database, as in the New Order form)` : '') + '.')
      } catch (e: any) {
        if (!cancelled) setDataError(`Could not read customers/products from the database: ${e?.message || e}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isAdmin])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setBusy(true)
    const added: ImportItem[] = []
    for (const file of Array.from(files)) {
      const id = `f${++seq}`
      const base = { id, fileName: file.name, input: {} as PreviewInput }
      try {
        const lower = file.name.toLowerCase()
        if (lower.endsWith('.csv') || file.type === 'text/csv') {
          const text = await file.text()
          if (!looksLikeMamanCsv(text)) { added.push({ ...base, parsed: null, error: 'This CSV is not in the Maman order format (expected columns: Account Number, Order Date, Item Code, Description, Packaging, Quantity).' }); continue }
          added.push({ ...base, parsed: parseMamanCsv(text, file.name), error: null })
        } else if (lower.endsWith('.eml') || file.type === 'message/rfc822') {
          const res = await parseOrderEmail(await file.arrayBuffer(), file.name)
          if (!res.ok) { added.push({ ...base, parsed: null, error: res.error }); continue }
          const received = res.parsed.email?.receivedDate || undefined
          added.push({ ...base, parsed: res.parsed, error: null, input: res.kind === 'maman' && received ? { receivedDate: received } : {} })
        } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
          const pdfItems = await extractPdfItems(file)
          if (!looksLikeWestvillePo(pdfItems)) { added.push({ ...base, parsed: null, error: 'This PDF is not in the Westville purchase-order format, or it has no readable text (a scanned image).' }); continue }
          added.push({ ...base, parsed: parseWestvillePo(pdfItems, file.name), error: null })
        } else {
          added.push({ ...base, parsed: null, error: 'Unsupported file type. Upload an order email (.eml), a Maman CSV or a Westville PDF.' })
        }
      } catch (e: any) {
        added.push({ ...base, parsed: null, error: `Could not read this file: ${e?.message || e}` })
      }
    }
    setItems(prev => [...added, ...prev])
    setBusy(false)
  }, [])

  const patchInput = (id: string, patch: Partial<PreviewInput>) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, input: { ...it.input, ...patch } } : it)))
  const patchLine = (id: string, sourceIndex: number, patch: { productId?: string; slicing?: string }) =>
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it
      const lo = { ...(it.input.lineOverrides || {}) }
      lo[sourceIndex] = { ...(lo[sourceIndex] || {}), ...patch }
      return { ...it, input: { ...it.input, lineOverrides: lo } }
    }))
  const remove = (id: string) => setItems(prev => prev.filter(it => it.id !== id))

  const previews = useMemo(
    () => items.map(it => (it.parsed ? buildPreview(it.parsed, { customers, products }, it.input) : null)),
    [items, customers, products],
  )

  if (!appUser) return <AppShell><div className="p-6 text-bark-800/60">Checking access…</div></AppShell>
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="card p-8 max-w-lg">
          <h1 className="section-header">PO Importer</h1>
          <p className="text-bark-800/70 mt-2">This page is available to admins only.</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="max-w-6xl">
        <h1 className="section-header">PO Importer</h1>
        <div className="mt-3 mb-5 p-3 rounded-lg border border-wheat-300 bg-wheat-100 text-sm text-bark-800/80 flex gap-2 items-start">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <b>Preview only (version 1).</b> Nothing here creates or changes orders, invoices, production data, customers or products.
            Any correction you make is for this preview only and is lost when you leave the page.
            The email inbox below only lists emails; "Mark ignored" changes that email's own inbox status and nothing else.
          </div>
        </div>

        <InboxPanel adminEmail={appUser?.email || ''} onOpen={file => addFiles([file])} />

        {dataError && <div className="mb-4 p-3 rounded border border-red-300 bg-red-50 text-sm text-red-800">{dataError}</div>}
        <div className="text-xs text-bark-800/50 mb-3">{loading ? 'Loading customers and products…' : dataNote}</div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
          onClick={() => fileRef.current?.click()}
          className={`card p-8 text-center cursor-pointer border-2 border-dashed ${dragging ? 'border-wheat-500 bg-wheat-100' : 'border-wheat-400/40'}`}
        >
          <Upload className="w-6 h-6 mx-auto mb-2 text-wheat-600" />
          <div className="font-semibold text-bark-900">{busy ? 'Reading files…' : 'Drop order emails (.eml), Maman CSVs or Westville PDFs here, or click to choose'}</div>
          <div className="text-xs text-bark-800/60 mt-1">The format is detected automatically. An email file (Gmail: ⋮ menu → Download message) also supplies the PO number and the received time. You can add several files at once.</div>
          <input
            ref={fileRef} type="file" accept=".eml,.csv,.pdf,message/rfc822,text/csv,application/pdf" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        <div className="mt-6 space-y-6">
          {items.map((it, i) => {
            const pv = previews[i]
            if (!pv) {
              return (
                <div key={it.id} className="card p-4 border-red-300">
                  <div className="flex justify-between items-start">
                    <div><b>{it.fileName}</b><div className="text-sm text-red-700 mt-1">{it.error}</div></div>
                    <button className="text-bark-800/50 hover:text-red-700" onClick={() => remove(it.id)} aria-label="Remove"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )
            }
            return (
              <PreviewCard
                key={it.id} item={it} pv={pv} customers={customers} products={products}
                onInput={patch => patchInput(it.id, patch)}
                onLine={(idx, patch) => patchLine(it.id, idx, patch)}
                onRemove={() => remove(it.id)}
              />
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}

// ─── One imported file ───────────────────────────────────────────────────────
function PreviewCard({ item, pv, customers, products, onInput, onLine, onRemove }: {
  item: ImportItem; pv: PreviewOrder; customers: Customer[]; products: Product[]
  onInput: (p: Partial<PreviewInput>) => void
  onLine: (sourceIndex: number, p: { productId?: string; slicing?: string }) => void
  onRemove: () => void
}) {
  const issues = allIssues(pv)
  const blocking = issues.filter(i => i.severity === 'blocking')
  const warnings = issues.filter(i => i.severity === 'warning')
  const infos = issues.filter(i => i.severity === 'info')
  const nBlock = blockingCount(pv)
  const isMaman = pv.kind === 'maman'
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products])
  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [customers])
  const csvDate = isMaman ? (item.parsed as any).csvOrderDate as string : ''

  return (
    <div className={`card p-5 ${nBlock ? 'border-red-300' : 'border-green-400'}`}>
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="font-display text-lg text-bark-900">{pv.fileName}</div>
          <div className="text-xs text-bark-800/60">{isMaman ? 'Maman CSV' : 'Westville PDF purchase order'}</div>
        </div>
        <div className="flex items-center gap-3">
          {nBlock
            ? <span className="badge bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />{nBlock} blocking</span>
            : <span className="badge bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />No blocking issues</span>}
          <button className="text-bark-800/50 hover:text-red-700" onClick={onRemove} aria-label="Remove file"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {blocking.length > 0 && (
        <div className="mt-4 p-3 rounded border border-red-300 bg-red-50">
          <div className="font-semibold text-red-800 text-sm mb-1">Needs attention before this could become an order</div>
          <ul className="list-disc ml-5 text-sm text-red-800 space-y-0.5">{dedupe(blocking).map((i, k) => <li key={k}>{i.message}</li>)}</ul>
        </div>
      )}

      {pv.email && (
        <div className="mt-4 p-3 rounded border border-wheat-300 bg-white text-sm grid md:grid-cols-4 gap-3">
          <div><div className="label">From</div><div className="break-all">{pv.email.from}</div></div>
          <div><div className="label">Subject</div><div>{pv.email.subject}</div></div>
          <div><div className="label">Received (New York)</div><div>{pv.email.receivedLocal || '—'}</div></div>
          <div>
            <div className="label">Sender check</div>
            {pv.email.senderVerified
              ? <span className="badge bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />{pv.email.senderNote}</span>
              : <span className="badge bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />{pv.email.senderNote}</span>}
            <div className="text-xs text-bark-800/60 mt-1">Attachment: {pv.email.attachmentName}</div>
          </div>
        </div>
      )}

      {/* Header facts */}
      <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="label">Customer</div>
          {pv.customer ? (
            <div>
              <b>{pv.customer.name}</b>{pv.customerIsManual && <span className="badge badge-wheat ml-2">picked by hand</span>}
              <div className="text-xs text-bark-800/60 font-mono">id {pv.customer.id}</div>
              {pv.customer.address && <div className="text-xs text-bark-800/60">{pv.customer.address}</div>}
            </div>
          ) : <div className="text-red-700">Not matched{pv.expectedCustomerName ? ` (expected "${pv.expectedCustomerName}")` : ''}</div>}
          <select
            className="input mt-2" value={item.input.customerIdOverride || ''}
            onChange={e => onInput({ customerIdOverride: e.target.value || undefined })}
          >
            <option value="">{pv.customer && !pv.customerIsManual ? 'Auto-matched (change…)' : 'Pick customer for this preview…'}</option>
            {(pv.customerCandidates.length > 1 ? sortedCustomers.filter(c => pv.customerCandidates.some(x => x.id === c.id)) : sortedCustomers).map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.active === false ? ' (inactive)' : ''} — {c.id}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="label">Location in the file</div>
          <div>{pv.sourceLocation || '—'}</div>
          <div className="label mt-3">PO number</div>
          <div>{pv.poNumber || <span className="text-bark-800/60">{isMaman ? 'Not in the CSV (drop in the order email to read it)' : '—'}</span>}</div>
        </div>
        <div>
          <div className="label">Delivery date</div>
          <div className="font-semibold">{pv.deliveryDate || '—'}</div>
          <div className="text-xs text-bark-800/60">{pv.deliveryDateNote}</div>
        </div>
      </div>

      {isMaman && (
        <div className="mt-4 p-3 rounded border border-wheat-300 bg-wheat-100/60 grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Email received date (New York) *{pv.email?.receivedDate ? ' (from the email)' : ''}</label>
            <input type="date" className="input" value={item.input.receivedDate || ''} onChange={e => onInput({ receivedDate: e.target.value, dateConfirmed: false })} />
            {csvDate && /^\d{4}-\d{2}-\d{2}$/.test(csvDate) && item.input.receivedDate !== csvDate && (
              <button type="button" className="text-xs underline mt-1" onClick={() => onInput({ receivedDate: csvDate, dateConfirmed: false })}>
                Use the CSV order date ({csvDate}) as the received date
              </button>
            )}
          </div>
          <div>
            <label className="label">Override delivery date (optional)</label>
            <input type="date" className="input" value={item.input.overrideDate || ''} onChange={e => onInput({ overrideDate: e.target.value || undefined, dateConfirmed: false })} />
            <div className="text-xs text-bark-800/60 mt-1">Use when the email states a date.</div>
          </div>
          <label className="md:col-span-2 flex items-center gap-2 text-sm pb-2">
            <input
              type="checkbox" checked={!!item.input.dateConfirmed} disabled={!pv.deliveryDate}
              onChange={e => onInput({ dateConfirmed: e.target.checked })}
            />
            I confirm the final delivery date{pv.deliveryDate ? ` is ${pv.deliveryDate}` : ''}.
          </label>
        </div>
      )}

            {!isMaman && (
        <div className="mt-4 p-3 rounded border border-wheat-300 bg-wheat-100/60 flex flex-wrap items-end gap-4">
          <div>
            <label className="label">Change delivery date (optional)</label>
            <input type="date" className="input" value={item.input.overrideDate || ''} onChange={e => onInput({ overrideDate: e.target.value || undefined })} />
          </div>
          <div className="text-xs text-bark-800/70 pb-2">
            Date printed on the PO: <b>{(item.parsed as any).deliveryDate || '—'}</b>. Use this when the delivery is moving or Westville asks for a different day. Preview only; nothing is saved.
            {item.input.overrideDate && (
              <button type="button" className="underline ml-2" onClick={() => onInput({ overrideDate: undefined })}>Back to the PO date</button>
            )}
          </div>
        </div>
      )}
      
      {/* Lines */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-bark-800/60 border-b border-wheat-400/30">
              <th className="py-2 pr-3">From the PO</th>
              <th className="py-2 pr-3">OMS product</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 pr-3">Slicing</th>
              <th className="py-2 pr-3 text-right">OMS price</th>
              {!isMaman && <th className="py-2 pr-3 text-right">PO price</th>}
              <th className="py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {pv.lines.map(l => (
              <LineRows key={l.sourceIndex} l={l} isMaman={isMaman} products={sortedProducts} onLine={onLine} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-wheat-400/30">
              <td colSpan={isMaman ? 5 : 6} className="py-2 pr-3 text-right font-semibold">Proposed total (OMS prices)</td>
              <td className="py-2 text-right font-mono font-semibold">{money(pv.proposedTotal)}</td>
            </tr>
            {pv.sourceTotal !== null && (
              <tr>
                <td colSpan={6} className="pr-3 text-right text-bark-800/70">PO total (reconciled against its lines)</td>
                <td className="text-right font-mono">{money(pv.sourceTotal)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {pv.zeroRows.length > 0 && (
        <details className="mt-3 text-sm text-bark-800/70">
          <summary className="cursor-pointer">{pv.zeroRows.length} zero-quantity row(s) ignored for the order (kept in the source file)</summary>
          <ul className="list-disc ml-5 mt-1">{pv.zeroRows.map((z, k) => <li key={k}>{z.description}{z.code ? ` (${z.code})` : ''}</li>)}</ul>
        </details>
      )}

      {(warnings.length > 0 || infos.length > 0) && (
        <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm">
          {warnings.length > 0 && (
            <div className="p-3 rounded border border-amber-300 bg-amber-50">
              <div className="font-semibold text-amber-900 mb-1 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Warnings</div>
              <ul className="list-disc ml-5 text-amber-900 space-y-0.5">{dedupe(warnings).map((i, k) => <li key={k}>{i.message}</li>)}</ul>
            </div>
          )}
          {infos.length > 0 && (
            <div className="p-3 rounded border border-wheat-300 bg-white">
              <div className="font-semibold text-bark-800 mb-1 flex items-center gap-1"><Info className="w-4 h-4" /> Notes</div>
              <ul className="list-disc ml-5 text-bark-800/80 space-y-0.5">{dedupe(infos).map((i, k) => <li key={k}>{i.message}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LineRows({ l, isMaman, products, onLine }: {
  l: PreviewLine; isMaman: boolean; products: Product[]
  onLine: (sourceIndex: number, p: { productId?: string; slicing?: string }) => void
}) {
  const badge =
    l.mappingStatus === 'confirmed' ? <span className="badge badge-sage">confirmed mapping</span>
    : l.mappingStatus === 'manual' ? <span className="badge badge-wheat">picked by hand</span>
    : l.mappingStatus === 'unconfirmed' ? <span className="badge bg-red-100 text-red-800">unconfirmed mapping</span>
    : <span className="badge bg-red-100 text-red-800">not mapped</span>
  const slicingLabel: Record<string, string> = { source: 'from the PO', mapping: 'from mapping', 'customer-default': 'customer default', manual: 'picked by hand', none: '' }
  const lineBlock = l.issues.some(i => i.severity === 'blocking')
  return (
    <>
      <tr className={`align-top border-b border-wheat-400/10 ${lineBlock ? 'bg-red-50/50' : ''}`}>
        <td className="py-2 pr-3">
          <div>{l.sourceDescription}</div>
          <div className="text-xs text-bark-800/60">{[l.sourceCode && `Code ${l.sourceCode}`, l.sourceDetail].filter(Boolean).join(' · ')}</div>
        </td>
        <td className="py-2 pr-3">
          <div className="flex flex-wrap items-center gap-2">
            <b>{l.productName || '—'}</b>{badge}
          </div>
          <div className="text-xs font-mono text-bark-800/60">{l.productId || ''}</div>
          <select className="input mt-1 text-xs" value="" onChange={e => e.target.value && onLine(l.sourceIndex, { productId: e.target.value })}>
            <option value="">{l.productId ? 'Change product (preview only)…' : 'Pick product (preview only)…'}</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.active === false ? ' (inactive)' : ''} — {p.id}</option>)}
          </select>
        </td>
        <td className="py-2 pr-3 text-right font-mono">{l.quantity ?? '—'}</td>
        <td className="py-2 pr-3">
          <select className="input text-xs" value={l.slicing} onChange={e => onLine(l.sourceIndex, { slicing: e.target.value })}>
            {SLICING_OPTIONS.map(o => <option key={o} value={o}>{o || '— no slice —'}</option>)}
            {!SLICING_OPTIONS.includes(l.slicing) && <option value={l.slicing}>{l.slicing}</option>}
          </select>
          <div className="text-xs text-bark-800/60 mt-0.5">{l.slicing ? slicingLabel[l.slicingSource] : ''}</div>
        </td>
        <td className="py-2 pr-3 text-right font-mono">{money(l.oneUnitPrice)}</td>
        {!isMaman && <td className="py-2 pr-3 text-right font-mono">{money(l.sourceUnitPrice)}</td>}
        <td className="py-2 text-right font-mono">{money(l.lineTotal)}</td>
      </tr>
      {l.issues.length > 0 && (
        <tr className="border-b border-wheat-400/10">
          <td colSpan={isMaman ? 6 : 7} className="pb-2 pt-0">
            <ul className="text-xs space-y-0.5">
              {l.issues.map((i, k) => (
                <li key={k} className={i.severity === 'blocking' ? 'text-red-700' : i.severity === 'warning' ? 'text-amber-800' : 'text-bark-800/60'}>
                  {i.severity === 'blocking' ? '⛔ ' : i.severity === 'warning' ? '⚠ ' : 'ℹ '}{i.message}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>()
  return list.filter(i => (seen.has(i.message) ? false : (seen.add(i.message), true)))
}
