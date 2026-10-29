'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useAuth } from '@/lib/auth-context'
import { useProducts } from '@/lib/useProducts'
import { customersService, ordersService } from '@/lib/db'
import { laborDb } from '@/lib/laborDb'
import {
  DEFAULT_STANDARDS, LaborDay, LaborDept, LaborStandards, Roster, ShapeClass, GustoParsed,
  buildKpiRow, computePack, computeRevenue, computeShape, deliveryDatesFor, efficiencyPct,
  efficiencyStatus, nameKey, parseGustoHours, splitHours, SHAPE_CLASS_LABELS, EffStatus,
} from '@/lib/labor'
import type { Customer, Order } from '@/types'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { Upload, Copy, Save } from 'lucide-react'

type LaborTab = 'forecast' | 'performance' | 'settings'

const STATUS_COLOR: Record<EffStatus, string> = {
  good: '#4a7c59',
  ok: '#c4943a',
  poor: '#c0392b',
  none: '#cbd5e0',
}

const h1 = (n: number) => n.toFixed(1)
const h2 = (n: number) => n.toFixed(2)
const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

// ─── Small pieces ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-bark-800/60">{label}</div>
      <div className="font-display text-3xl text-bark-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-bark-800/60 mt-1">{sub}</div>}
    </div>
  )
}

function EffBar({
  label, expected, actual, standards, note,
}: {
  label: string
  expected: number | null
  actual: number | null
  standards: LaborStandards
  note?: string
}) {
  const pct = expected !== null && actual !== null ? efficiencyPct(expected, actual) : null
  const status = efficiencyStatus(pct, standards)
  const width = pct === null ? 0 : Math.min(pct, 150) / 150 * 100
  const over = expected !== null && actual !== null && actual > expected ? actual - expected : 0
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between mb-1 gap-3">
        <div className="font-medium text-bark-900">{label}</div>
        <div className="text-sm text-bark-800/70 text-right">
          {expected !== null ? `Expected ${h1(expected)} h` : 'Expected —'}
          {' · '}
          {actual !== null ? `Actual ${h1(actual)} h` : 'Actual —'}
          {' · '}
          <span style={{ color: STATUS_COLOR[status], fontWeight: 700 }}>
            {pct === null ? '—' : `${pct.toFixed(0)}%`}
          </span>
        </div>
      </div>
      <div className="relative h-4 rounded bg-cream-100 overflow-hidden">
        <div style={{ width: `${width}%`, backgroundColor: STATUS_COLOR[status] }} className="h-full rounded" />
        {/* marker at 100% */}
        <div style={{ left: `${(100 / 150) * 100}%` }} className="absolute top-0 bottom-0 w-px bg-bark-900/50" />
      </div>
      <div className="text-xs mt-1" style={{ color: over > 0 ? STATUS_COLOR.poor : undefined }}>
        {over > 0 ? `Used ${h1(over)} h more than expected. ` : ''}
        <span className="text-bark-800/50">{note}</span>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function LaborPage() {
  const { appUser } = useAuth()
  const { products } = useProducts()

  const [tab, setTab] = useState<LaborTab>('forecast')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd')) // production date
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [standards, setStandards] = useState<LaborStandards>(DEFAULT_STANDARDS)
  const [roster, setRoster] = useState<Roster>({})
  const [day, setDay] = useState<LaborDay | null>(null)

  const isAdmin = appUser?.role === 'admin'
  const deliveryDates = useMemo(() => deliveryDatesFor(date), [date])

  useEffect(() => {
    if (!isAdmin) return
    const unsub = customersService.subscribeAll(setCustomers)
    laborDb.getStandards().then(setStandards).catch(() => toast.error('Could not load labor standards'))
    laborDb.getRoster().then(setRoster).catch(() => toast.error('Could not load roster'))
    return () => unsub()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    setOrdersLoading(true)
    Promise.all(deliveryDates.map(d => ordersService.getByDate(d)))
      .then(lists => { if (!cancelled) setOrders(lists.flat()) })
      .catch(() => toast.error('Could not load orders'))
      .finally(() => { if (!cancelled) setOrdersLoading(false) })
    return () => { cancelled = true }
  }, [isAdmin, deliveryDates])

  useEffect(() => {
    if (!isAdmin) return
    return laborDb.subscribeDay(date, setDay)
  }, [isAdmin, date])

  const pack = useMemo(() => computePack(orders, customers, standards), [orders, customers, standards])
  const shape = useMemo(() => computeShape(orders, products, standards), [orders, products, standards])
  const rev = useMemo(() => computeRevenue(orders, standards), [orders, standards])

  if (!appUser) {
    return <AppShell><div className="p-6 text-bark-800/60">Checking access…</div></AppShell>
  }
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="card p-8 max-w-lg">
          <h1 className="section-header">Labor</h1>
          <p className="text-bark-800/70 mt-2">This page is available to admins only.</p>
        </div>
      </AppShell>
    )
  }

  const tabs: { id: LaborTab; label: string }[] = [
    { id: 'forecast', label: 'Forecast' },
    { id: 'performance', label: 'Daily Performance' },
    { id: 'settings', label: 'Standards & Roster' },
  ]

  const deliveryLabel = deliveryDates.map(d => format(parseISO(d), 'EEE MMM d')).join(' + ')

  return (
    <AppShell>
      <div className="max-w-5xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h1 className="section-header">Operations KPIs / Labor</h1>
            <p className="text-bark-800/60 text-sm">
              Production day {format(parseISO(date), 'EEE MMM d')} · covers deliveries {deliveryLabel}
            </p>
          </div>
          <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="input w-44" />
        </div>

        <div className="flex gap-0 mb-6 border-b border-wheat-400/30 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '12px 16px', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '14px', fontWeight: 500,
                borderBottom: tab === t.id ? '2px solid #c4943a' : '2px solid transparent',
                color: tab === t.id ? '#1a0f00' : '#7a6040', background: 'none', cursor: 'pointer', marginBottom: '-1px',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'forecast' && (
          <ForecastTab
            loading={ordersLoading} pack={pack} shape={shape} revenue={rev.revenue} invoices={rev.invoices}
            standards={standards}
          />
        )}
        {tab === 'performance' && (
          <PerformanceTab
            date={date} setDate={setDate} loading={ordersLoading}
            pack={pack} shape={shape} revenue={rev.revenue} invoices={rev.invoices}
            standards={standards} roster={roster} setRoster={setRoster} day={day}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab standards={standards} setStandards={setStandards} roster={roster} setRoster={setRoster} />
        )}
      </div>
    </AppShell>
  )
}

// ─── FORECAST ────────────────────────────────────────────────────────────────
function ForecastTab({
  loading, pack, shape, revenue, invoices, standards,
}: {
  loading: boolean
  pack: ReturnType<typeof computePack>
  shape: ReturnType<typeof computeShape>
  revenue: number
  invoices: number
  standards: LaborStandards
}) {
  const modeled = pack.expectedHours + shape.workcellHours
  return (
    <div>
      <div className="mb-4 p-3 rounded-lg bg-wheat-100 border border-wheat-300 text-sm text-bark-800/70">
        <b>FORECAST</b> — calculated from orders already in the OMS, using your labor standards. These are expected
        hours, not actual results. Mixing and baking are not modeled yet.
      </div>
      {loading && <div className="text-bark-800/60 mb-3">Loading orders…</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Expected packing hours" value={h1(pack.expectedHours)}
          sub={`≈ ${(pack.expectedHours / standards.shiftHours).toFixed(1)} people on a ${standards.shiftHours} h shift`} />
        <StatCard label="Expected shaping hours" value={h1(shape.workcellHours)}
          sub={`≈ ${(shape.workcellHours / standards.shiftHours).toFixed(1)} people on a ${standards.shiftHours} h shift`} />
        <StatCard label="Modeled total" value={h1(modeled)} sub="packing + shaping" />
        <StatCard label="Expected revenue" value={money(revenue)} sub={`${invoices} invoices`} />
      </div>

      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 font-display text-lg text-bark-900">Packing</div>
        <table className="table-base">
          <thead>
            <tr><th>Item</th><th style={{ textAlign: 'right' }}>Count</th><th style={{ textAlign: 'right' }}>Minutes</th></tr>
          </thead>
          <tbody>
            <tr><td>Invoices</td><td style={{ textAlign: 'right' }}>{pack.invoices}</td><td style={{ textAlign: 'right' }}>{h1(pack.invoiceMinutes)}</td></tr>
            <tr><td>FreshDirect invoices (extra)</td><td style={{ textAlign: 'right' }}>{pack.freshDirectInvoices}</td><td style={{ textAlign: 'right' }}>{h1(pack.freshDirectMinutes)}</td></tr>
            <tr><td>Thick-sliced units</td><td style={{ textAlign: 'right' }}>{pack.thickUnits}</td><td style={{ textAlign: 'right' }}>{h1(pack.thickMinutes)}</td></tr>
            <tr><td>Regular-sliced units</td><td style={{ textAlign: 'right' }}>{pack.regularUnits}</td><td style={{ textAlign: 'right' }}>{h1(pack.regularMinutes)}</td></tr>
            <tr><td>Bun-sliced units</td><td style={{ textAlign: 'right' }}>{pack.bunUnits}</td><td style={{ textAlign: 'right' }}>{h1(pack.bunMinutes)}</td></tr>
            <tr style={{ fontWeight: 700 }}>
              <td>Total</td><td style={{ textAlign: 'right' }}>{h1(pack.expectedHours)} h</td>
              <td style={{ textAlign: 'right' }}>{h1(pack.expectedMinutes)}</td>
            </tr>
          </tbody>
        </table>
        <div className="px-4 py-2 text-xs text-bark-800/60">
          Slice-dominance index: {(pack.sdi * 100).toFixed(0)}% of packing time is slicing.
          Customers on your exclusion list are left out.
        </div>
      </div>

      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 font-display text-lg text-bark-900">Shaping</div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Product type</th><th style={{ textAlign: 'right' }}>Units</th>
              <th style={{ textAlign: 'right' }}>Hours / unit</th><th style={{ textAlign: 'right' }}>Touch hours</th>
            </tr>
          </thead>
          <tbody>
            {shape.rows.filter(r => r.units > 0).map(r => (
              <tr key={r.cls}>
                <td>{r.label}</td>
                <td style={{ textAlign: 'right' }}>{r.units}</td>
                <td style={{ textAlign: 'right' }}>{r.coefficient}</td>
                <td style={{ textAlign: 'right' }}>{h2(r.hours)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td>Touch hours</td><td style={{ textAlign: 'right' }}>{shape.totalUnits}</td><td />
              <td style={{ textAlign: 'right' }}>{h2(shape.touchHours)}</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td>Workcell hours (× {standards.workcellFactor})</td><td /><td />
              <td style={{ textAlign: 'right' }}>{h2(shape.workcellHours)}</td>
            </tr>
          </tbody>
        </table>
        {shape.otherProducts.length > 0 && (
          <div className="px-4 py-2 text-xs text-bark-800/60">
            Counted as "Other (not defined)": {shape.otherProducts.join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DAILY PERFORMANCE ───────────────────────────────────────────────────────
function PerformanceTab({
  date, setDate, loading, pack, shape, revenue, invoices, standards, roster, setRoster, day,
}: {
  date: string
  setDate: (d: string) => void
  loading: boolean
  pack: ReturnType<typeof computePack>
  shape: ReturnType<typeof computeShape>
  revenue: number
  invoices: number
  standards: LaborStandards
  roster: Roster
  setRoster: (r: Roster) => void
  day: LaborDay | null
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<GustoParsed | null>(null)
  const [choices, setChoices] = useState<Record<string, LaborDept | ''>>({})
  const [workcell, setWorkcell] = useState('')
  const [revOverride, setRevOverride] = useState('')
  const [notes, setNotes] = useState({ general: '', packaging: '', production: '' })

  // Load the saved day's values into the form when the date/day changes.
  useEffect(() => {
    setWorkcell(day?.actualWorkcellHours ? String(day.actualWorkcellHours) : '')
    setRevOverride(day?.revenueOverride ? String(day.revenueOverride) : '')
    setNotes({
      general: day?.notes?.general || '',
      packaging: day?.notes?.packaging || '',
      production: day?.notes?.production || '',
    })
  }, [day?.date, day?.uploadedAt, day?.actualWorkcellHours, day?.revenueOverride])

  const hasHours = !!day?.uploadedAt
  const totalHours = hasHours ? (day?.totalHours ?? 0) : null
  const packHours = hasHours ? (day?.packHours ?? 0) : null
  const prodHours = hasHours ? (day?.productionHours ?? 0) : null
  const wcActual = parseFloat(workcell) > 0 ? parseFloat(workcell) : null
  const revenueUsed = parseFloat(revOverride) > 0 ? parseFloat(revOverride) : revenue

  // Efficiency scope: packing only until shaping hours are entered.
  const scopeExpected = wcActual !== null ? pack.expectedHours + shape.workcellHours : pack.expectedHours
  const scopeActual = packHours !== null ? (wcActual !== null ? packHours + wcActual : packHours) : null
  const overallPct = scopeActual !== null ? efficiencyPct(scopeExpected, scopeActual) : null
  const overallStatus = efficiencyStatus(overallPct, standards)

  async function applyUpload(parsed: GustoParsed, currentRoster: Roster) {
    const split = splitHours(parsed.people, currentRoster)
    await laborDb.saveDay({
      date: parsed.date,
      uploadedAt: new Date().toISOString(),
      people: split.rows,
      totalHours: split.totalHours,
      packHours: split.packHours,
      productionHours: split.productionHours,
      overtimeHours: split.overtimeHours,
    })
    if (parsed.date !== date) setDate(parsed.date)
    toast.success(`Hours saved for ${format(parseISO(parsed.date), 'EEE MMM d')}`)
  }

  async function handleFile(file: File) {
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      const rows: any[][] = []
      ws.eachRow({ includeEmpty: true }, row => { rows.push((row.values as any[]).slice(1)) })
      const parsed = parseGustoHours(rows)
      const split = splitHours(parsed.people, roster)
      if (split.unknown.length) {
        const init: Record<string, LaborDept | ''> = {}
        split.unknown.forEach(p => { init[nameKey(p.name)] = '' })
        setChoices(init)
        setPending(parsed)
        return
      }
      await applyUpload(parsed, roster)
    } catch (e: any) {
      toast.error(e?.message || 'Could not read that file')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveAssignments() {
    if (!pending) return
    const next: Roster = { ...roster }
    pending.people.forEach(p => {
      const k = nameKey(p.name)
      const c = choices[k]
      if (c && !next[k]) next[k] = { name: p.name, dept: c }
    })
    try {
      await laborDb.saveRoster(next)
      setRoster(next)
      await applyUpload(pending, next)
      setPending(null)
    } catch {
      toast.error('Could not save')
    }
  }

  async function saveDetails() {
    try {
      await laborDb.saveDay({
        date,
        actualWorkcellHours: wcActual,
        revenueOverride: parseFloat(revOverride) > 0 ? parseFloat(revOverride) : null,
        notes,
      })
      toast.success('Saved')
    } catch {
      toast.error('Could not save')
    }
  }

  function copyKpiRow() {
    const noteText = [notes.general, notes.packaging && `Pack: ${notes.packaging}`, notes.production && `Production: ${notes.production}`]
      .filter(Boolean).join(' | ')
    const row = buildKpiRow({
      date, revenue: revenueUsed, invoices, totalHours, packHours, pack, shape,
      actualWorkcellHours: wcActual, notes: noteText, grossMarginPct: standards.grossMarginPct,
    })
    navigator.clipboard.writeText(row).then(
      () => toast.success('KPI row copied. Paste it into your KPI sheet.'),
      () => toast.error('Could not copy'),
    )
  }

  const unknownList = pending ? splitHours(pending.people, roster).unknown : []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          ref={fileRef} type="file" accept=".xlsx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <button className="btn-primary flex items-center gap-2" onClick={() => fileRef.current?.click()}>
          <Upload className="w-4 h-4" /> Upload Gusto hours file
        </button>
        <button className="btn-secondary flex items-center gap-2" onClick={copyKpiRow}>
          <Copy className="w-4 h-4" /> Copy KPI row
        </button>
        <span className="text-xs text-bark-800/60">
          {hasHours ? `Hours loaded ${format(parseISO(day!.uploadedAt!), 'MMM d, h:mm a')}` : 'No hours uploaded for this day yet'}
        </span>
      </div>

      {pending && (
        <div className="card p-4 mb-5 border border-wheat-400">
          <div className="font-medium text-bark-900 mb-1">New names in this file</div>
          <p className="text-sm text-bark-800/70 mb-3">
            Tell me where each person belongs once. After that, uploads are automatic.
          </p>
          {unknownList.map(p => {
            const k = nameKey(p.name)
            return (
              <div key={k} className="flex items-center justify-between gap-3 py-1">
                <div className="text-sm">{p.name} <span className="text-bark-800/50">· {h1(p.totalHours)} h</span></div>
                <select
                  className="input w-44" value={choices[k] || ''}
                  onChange={e => setChoices(prev => ({ ...prev, [k]: e.target.value as LaborDept | '' }))}
                >
                  <option value="">Choose…</option>
                  <option value="packaging">Packaging</option>
                  <option value="production">Production</option>
                  <option value="ignore">Leave out</option>
                </select>
              </div>
            )
          })}
          <div className="flex gap-2 mt-3">
            <button
              className="btn-primary" onClick={saveAssignments}
              disabled={unknownList.some(p => !choices[nameKey(p.name)])}
            >Save and apply</button>
            <button className="btn-secondary" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div className="text-bark-800/60 mb-3">Loading orders…</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Expected labor hours" value={h1(pack.expectedHours + shape.workcellHours)}
          sub={`packing ${h1(pack.expectedHours)} + shaping ${h1(shape.workcellHours)} (mix & bake not modeled)`} />
        <StatCard label="Actual labor hours" value={totalHours !== null ? h1(totalHours) : '—'}
          sub={hasHours ? `packing ${h1(packHours ?? 0)} · production ${h1(prodHours ?? 0)}` : 'Upload the Gusto file'} />
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-bark-800/60">Labor efficiency</div>
          <div className="font-display text-3xl mt-1" style={{ color: STATUS_COLOR[overallStatus] }}>
            {overallPct === null ? '—' : `${overallPct.toFixed(0)}%`}
          </div>
          <div className="text-xs text-bark-800/60 mt-1">
            {wcActual !== null ? 'packing + shaping' : 'packing only (enter shaping hours below)'}
          </div>
        </div>
        <StatCard label="Revenue per labor hour"
          value={totalHours ? `$${(revenueUsed / totalHours).toFixed(0)}` : '—'}
          sub={`${money(revenueUsed)} revenue · labor % arrives with pay rates`} />
      </div>

      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-4">Department performance</div>
        <EffBar label="Packing (incl. slicing)" expected={pack.expectedHours} actual={packHours} standards={standards} />
        <EffBar
          label="Shaping" expected={shape.workcellHours} actual={wcActual} standards={standards}
          note={wcActual === null ? 'Enter actual shaping workcell hours below' : undefined}
        />
        <EffBar
          label="Other production (mix, bake, clean, support)" expected={null}
          actual={prodHours !== null ? Math.max(prodHours - (wcActual ?? 0), 0) : null}
          standards={standards} note="No standard yet. The team will need to track mix, bake and cleaning time."
        />
      </div>

      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-3">Your inputs for the day</div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Actual shaping workcell hours</label>
            <input className="input" type="number" min="0" step="0.25" value={workcell} onChange={e => setWorkcell(e.target.value)}
              placeholder="e.g. 13 (2 people × 2 h + 3 people × 3 h)" />
          </div>
          <div>
            <label className="label">Revenue override (optional, e.g. from FreshBooks)</label>
            <input className="input" type="number" min="0" step="0.01" value={revOverride} onChange={e => setRevOverride(e.target.value)}
              placeholder={`OMS total: ${money(revenue)}`} />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-4">
          {(['general', 'packaging', 'production'] as const).map(k => (
            <div key={k}>
              <label className="label">{k === 'general' ? 'Notes — day overall' : k === 'packaging' ? 'Notes — packing variance' : 'Notes — production variance'}</label>
              <textarea className="input" rows={3} value={notes[k]} onChange={e => setNotes(prev => ({ ...prev, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        <button className="btn-primary flex items-center gap-2 mt-4" onClick={saveDetails}>
          <Save className="w-4 h-4" /> Save
        </button>
      </div>

      {day?.people && day.people.length > 0 && (
        <details className="card p-4 mb-6">
          <summary className="cursor-pointer text-sm text-bark-800/70">Who is counted where ({day.people.length} people)</summary>
          <table className="table-base mt-3">
            <thead><tr><th>Name</th><th>Department</th><th style={{ textAlign: 'right' }}>Hours</th></tr></thead>
            <tbody>
              {day.people.map(p => (
                <tr key={p.name}><td>{p.name}</td><td>{p.dept === 'ignore' ? 'Left out' : p.dept}</td><td style={{ textAlign: 'right' }}>{h2(p.hours)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function SettingsTab({
  standards, setStandards, roster, setRoster,
}: {
  standards: LaborStandards
  setStandards: (s: LaborStandards) => void
  roster: Roster
  setRoster: (r: Roster) => void
}) {
  const [draft, setDraft] = useState<LaborStandards>(standards)
  const [freshText, setFreshText] = useState(standards.freshDirectMatch.join(', '))
  const [exclText, setExclText] = useState(standards.excludedCustomers.join(', '))
  useEffect(() => {
    setDraft(standards)
    setFreshText(standards.freshDirectMatch.join(', '))
    setExclText(standards.excludedCustomers.join(', '))
  }, [standards])

  const num = (v: string) => (v === '' ? 0 : parseFloat(v) || 0)
  const field = (label: string, key: keyof Omit<LaborStandards, 'shapeCoefficients' | 'freshDirectMatch' | 'excludedCustomers'>, hint?: string) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" step="any" value={draft[key]} onChange={e => setDraft({ ...draft, [key]: num(e.target.value) })} />
      {hint && <div className="text-xs text-bark-800/50 mt-1">{hint}</div>}
    </div>
  )

  async function save() {
    const next: LaborStandards = {
      ...draft,
      freshDirectMatch: freshText.split(',').map(s => s.trim()).filter(Boolean),
      excludedCustomers: exclText.split(',').map(s => s.trim()).filter(Boolean),
    }
    try {
      await laborDb.saveStandards(next)
      setStandards(next)
      toast.success('Standards saved')
    } catch {
      toast.error('Could not save')
    }
  }

  async function updateRoster(next: Roster) {
    try {
      await laborDb.saveRoster(next)
      setRoster(next)
    } catch {
      toast.error('Could not save roster')
    }
  }

  const people = Object.entries(roster).sort((a, b) => a[1].name.localeCompare(b[1].name))

  return (
    <div>
      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-1">Packing standards</div>
        <p className="text-xs text-bark-800/60 mb-3">Starting values come from your KPI SOP. Slice times are in minutes (45 s = 0.75).</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {field('Minutes per invoice', 'invoiceMin')}
          {field('Extra minutes per FreshDirect invoice', 'freshDirectExtraMin')}
          {field('Thick slice (min / unit)', 'thickSliceMin')}
          {field('Regular slice (min / unit)', 'regularSliceMin')}
          {field('Bun slice (min / unit)', 'bunSliceMin')}
        </div>
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">FreshDirect customers (comma separated words)</label>
            <input className="input" value={freshText} onChange={e => setFreshText(e.target.value)} />
            <div className="text-xs text-bark-800/50 mt-1">Matched against the customer name and distributor code.</div>
          </div>
          <div>
            <label className="label">Customers left out of invoices and revenue</label>
            <input className="input" value={exclText} onChange={e => setExclText(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-1">Shaping standards</div>
        <p className="text-xs text-bark-800/60 mb-3">Hours per unit. Workcell hours = touch hours × the factor.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(Object.keys(draft.shapeCoefficients) as ShapeClass[]).map(k => (
            <div key={k}>
              <label className="label">{SHAPE_CLASS_LABELS[k]}</label>
              <input className="input" type="number" step="any" value={draft.shapeCoefficients[k]}
                onChange={e => setDraft({ ...draft, shapeCoefficients: { ...draft.shapeCoefficients, [k]: num(e.target.value) } })} />
            </div>
          ))}
          {field('Workcell factor', 'workcellFactor')}
        </div>
      </div>

      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-3">Targets and planning</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {field('Green at or above (%)', 'effGreen')}
          {field('Amber at or above (%)', 'effAmber', 'Below this is red')}
          {field('Shift length (hours)', 'shiftHours', 'Used for "≈ people"')}
          {field('Gross margin (%)', 'grossMarginPct', '100 minus COGS')}
        </div>
        <button className="btn-primary flex items-center gap-2 mt-4" onClick={save}>
          <Save className="w-4 h-4" /> Save standards
        </button>
      </div>

      <div className="card p-5">
        <div className="font-display text-lg text-bark-900 mb-1">Roster</div>
        <p className="text-xs text-bark-800/60 mb-3">
          Who counts as Packaging, Production, or is left out. New names from a Gusto upload are added here automatically.
          No pay rates are stored in this phase.
        </p>
        {people.length === 0 ? (
          <div className="text-sm text-bark-800/60">No one yet. Upload a Gusto file on the Daily Performance tab.</div>
        ) : (
          <table className="table-base">
            <thead><tr><th>Name</th><th>Department</th><th /></tr></thead>
            <tbody>
              {people.map(([k, p]) => (
                <tr key={k}>
                  <td>{p.name}</td>
                  <td>
                    <select className="input w-40" value={p.dept}
                      onChange={e => updateRoster({ ...roster, [k]: { ...p, dept: e.target.value as LaborDept } })}>
                      <option value="packaging">Packaging</option>
                      <option value="production">Production</option>
                      <option value="ignore">Leave out</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-ghost" onClick={() => { const n = { ...roster }; delete n[k]; updateRoster(n) }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
