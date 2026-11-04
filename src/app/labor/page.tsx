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
  SHAPE_CLASSES, EXTRA_PRESETS, ExtraItem, ShapeMap, shapeClassOf,
  MixLogDay, computeMixBake, mixLogHours, mixLogKg,
} from '@/lib/labor'
import type { Customer, Order, Product } from '@/types'
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

// One horizontal bar split into departments, scaled so Expected and Actual bars compare fairly.
const DEPT_COLORS: Record<string, string> = {
  Packing: '#c4943a', Shaping: '#7a8b55', Mixing: '#8b6355', Baking: '#b5532a', Other: '#cbd5e0',
}
type Segment = { label: string; hours: number | null }

function StackedBar({ title, segments, scale }: { title: string; segments: Segment[]; scale: number }) {
  const total = segments.reduce((s, x) => s + (x.hours || 0), 0)
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-sm font-medium text-bark-900">{title}</div>
        <div className="text-sm text-bark-800/70">{h1(total)} h</div>
      </div>
      <div className="flex h-6 rounded overflow-hidden bg-cream-100">
        {segments.map(seg => {
          const hrs = seg.hours || 0
          if (hrs <= 0) return null
          return (
            <div
              key={seg.label}
              title={`${seg.label}: ${h1(hrs)} h`}
              style={{ width: `${(hrs / scale) * 100}%`, backgroundColor: DEPT_COLORS[seg.label] || '#999' }}
              className="h-full flex items-center justify-center text-[10px] text-white overflow-hidden"
            >
              {hrs / scale > 0.07 ? h1(hrs) : ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-bark-800/70 mt-1">
      {Object.entries(DEPT_COLORS).map(([k, c]) => (
        <span key={k} className="flex items-center gap-1"><span style={{ backgroundColor: c }} className="inline-block w-3 h-3 rounded-sm" />{k}</span>
      ))}
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
  const [shapeMap, setShapeMap] = useState<ShapeMap>({})
  const [day, setDay] = useState<LaborDay | null>(null)
  const [mixLog, setMixLog] = useState<MixLogDay | null>(null)

  const isAdmin = appUser?.role === 'admin'
  const deliveryDates = useMemo(() => deliveryDatesFor(date), [date])

  useEffect(() => {
    if (!isAdmin) return
    const unsub = customersService.subscribeAll(setCustomers)
    laborDb.getStandards().then(setStandards).catch(() => toast.error('Could not load labor standards'))
    laborDb.getRoster().then(setRoster).catch(() => toast.error('Could not load roster'))
    laborDb.getShapeMap().then(setShapeMap).catch(() => toast.error('Could not load product types'))
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

  useEffect(() => {
    if (!isAdmin) return
    return laborDb.subscribeMixLog(date, setMixLog)
  }, [isAdmin, date])

  const pack = useMemo(() => computePack(orders, customers, standards), [orders, customers, standards])
  const extraItems = day?.extra || []
  const extraKey = JSON.stringify(extraItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shape = useMemo(() => computeShape(orders, products, standards, shapeMap, extraItems), [orders, products, standards, shapeMap, extraKey])
  const rev = useMemo(() => computeRevenue(orders, standards), [orders, standards])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mixBake = useMemo(() => computeMixBake(orders, products, standards, extraItems), [orders, products, standards, extraKey])

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
            loading={ordersLoading} pack={pack} shape={shape} mixBake={mixBake} revenue={rev.revenue} invoices={rev.invoices}
            standards={standards} date={date} extra={extraItems}
          />
        )}
        {tab === 'performance' && (
          <PerformanceTab
            date={date} setDate={setDate} loading={ordersLoading}
            pack={pack} shape={shape} mixBake={mixBake} mixLog={mixLog} revenue={rev.revenue} invoices={rev.invoices}
            standards={standards} roster={roster} setRoster={setRoster} day={day}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            standards={standards} setStandards={setStandards} roster={roster} setRoster={setRoster}
            products={products} shapeMap={shapeMap} setShapeMap={setShapeMap}
          />
        )}
      </div>
    </AppShell>
  )
}

// ─── FORECAST ────────────────────────────────────────────────────────────────
function ForecastTab({
  loading, pack, shape, mixBake, revenue, invoices, standards, date, extra,
}: {
  loading: boolean
  pack: ReturnType<typeof computePack>
  shape: ReturnType<typeof computeShape>
  mixBake: ReturnType<typeof computeMixBake>
  revenue: number
  invoices: number
  standards: LaborStandards
  date: string
  extra: ExtraItem[]
}) {
  const bakeHours = mixBake.rackHours + mixBake.deckHours
  const modeled = pack.expectedHours + shape.workcellHours + mixBake.mixHours + bakeHours
  const segments: Segment[] = [
    { label: 'Packing', hours: pack.expectedHours }, { label: 'Shaping', hours: shape.workcellHours },
    { label: 'Mixing', hours: mixBake.mixHours }, { label: 'Baking', hours: bakeHours },
  ]
  const people = (h: number) => `≈ ${(h / standards.shiftHours).toFixed(1)} people on a ${standards.shiftHours} h shift`
  return (
    <div>
      <div className="mb-4 p-3 rounded-lg bg-wheat-100 border border-wheat-300 text-sm text-bark-800/70">
        <b>FORECAST</b> — calculated from orders already in the OMS, using your labor standards. These are expected
        hours, not actual results. Baking hours are oven running time (one rack oven, one deck oven). Pretzels and
        Schripps products are made by another team and are left out.
      </div>
      {loading && <div className="text-bark-800/60 mb-3">Loading orders…</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label="Expected packing hours" value={h1(pack.expectedHours)} sub={people(pack.expectedHours)} />
        <StatCard label="Expected shaping hours" value={h1(shape.workcellHours)} sub={people(shape.workcellHours)} />
        <StatCard label="Expected mixing hours" value={h1(mixBake.mixHours)} sub={`${Math.round(mixBake.mixKg)} kg dough`} />
        <StatCard label="Expected baking hours" value={h1(bakeHours)}
          sub={`rack ${h1(mixBake.rackHours)} · deck ${h1(mixBake.deckHours)} (oven time)`} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Expected labor hours, all departments" value={h1(modeled)} sub="packing + shaping + mixing + baking" />
        <StatCard label="Expected revenue" value={money(revenue)} sub={`${invoices} invoices`} />
      </div>

      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-3">Full production day (expected hours)</div>
        <StackedBar title="Expected" segments={segments} scale={Math.max(modeled, 1)} />
        <Legend />
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
            {shape.extraRows.map(r => (
              <tr key={r.id}>
                <td>{r.project || 'Extra production'} <span className="text-bark-800/50">(no invoice · {r.label})</span></td>
                <td style={{ textAlign: 'right' }}>{r.units}</td>
                <td style={{ textAlign: 'right' }}>{+(r.hours / r.units).toFixed(4)}</td>
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
            Counted as "Other (not defined)": {shape.otherProducts.join(', ')}. You can set their type on the Standards & Roster tab.
          </div>
        )}
      </div>

      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 font-display text-lg text-bark-900">Mixing</div>
        <table className="table-base">
          <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Value</th></tr></thead>
          <tbody>
            <tr><td>Planned dough (unit weight × quantity)</td><td style={{ textAlign: 'right' }}>{Math.round(mixBake.mixKg).toLocaleString()} kg</td></tr>
            <tr><td>Standard</td><td style={{ textAlign: 'right' }}>{standards.mixKgPerHour} kg per mix hour</td></tr>
            <tr style={{ fontWeight: 700 }}><td>Expected mix hours</td><td style={{ textAlign: 'right' }}>{h2(mixBake.mixHours)} h</td></tr>
          </tbody>
        </table>
        {mixBake.missingWeights.length > 0 && (
          <div className="px-4 py-2 text-xs text-bark-800/60">
            No unit weight set, so not in the kg total: {mixBake.missingWeights.join(', ')}.
          </div>
        )}
      </div>

      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 font-display text-lg text-bark-900">Baking</div>
        <table className="table-base">
          <thead>
            <tr><th>Oven</th><th style={{ textAlign: 'right' }}>Planned</th><th style={{ textAlign: 'right' }}>Standard</th><th style={{ textAlign: 'right' }}>Hours</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Deck oven (Bake Sheet items)</td>
              <td style={{ textAlign: 'right' }}>{Math.round(mixBake.deckUnits).toLocaleString()} loaves</td>
              <td style={{ textAlign: 'right' }}>{standards.deckUnitsPerHour} / h</td>
              <td style={{ textAlign: 'right' }}>{h2(mixBake.deckHours)}</td>
            </tr>
            <tr>
              <td>Rack oven (everything else)</td>
              <td style={{ textAlign: 'right' }}>{mixBake.rackEquivalents.toFixed(1)} racks <span className="text-bark-800/50">({Math.round(mixBake.rackUnits).toLocaleString()} units)</span></td>
              <td style={{ textAlign: 'right' }}>{standards.rackRacksPerHour} racks / h</td>
              <td style={{ textAlign: 'right' }}>{h2(mixBake.rackHours)}</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td>Expected oven hours</td><td /><td /><td style={{ textAlign: 'right' }}>{h2(bakeHours)}</td>
            </tr>
          </tbody>
        </table>
        <div className="px-4 py-2 text-xs text-bark-800/60">
          Racks = units ÷ the max units per rack from your Rack Benchmarks table (Pullman with no size in the name counts as Large).
          {mixBake.unclassified.length > 0 && <> No rack size defined, so left out: {mixBake.unclassified.join(', ')}.</>}
          {mixBake.outsideUnits > 0 && <> {Math.round(mixBake.outsideUnits)} pretzel / Schripps units left out (other team).</>}
        </div>
      </div>

      <ExtraProduction date={date} extra={extra} />
    </div>
  )
}

// ─── EXTRA PRODUCTION (no invoice) ───────────────────────────────────────────
function ExtraProduction({ date, extra }: { date: string; extra: ExtraItem[] }) {
  const [items, setItems] = useState<ExtraItem[]>(extra)
  const extraKey = JSON.stringify(extra)
  useEffect(() => { setItems(extra) }, [date, extraKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(items) !== extraKey

  const add = (project: string, cls: ShapeClass) =>
    setItems(prev => [...prev, { id: `${Date.now()}-${prev.length}`, project, cls, units: 0 }])
  const change = (id: string, patch: Partial<ExtraItem>) =>
    setItems(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)))

  async function save() {
    try {
      await laborDb.saveDay({ date, extra: items.filter(x => x.units > 0) })
      toast.success('Extra production saved')
    } catch {
      toast.error('Could not save')
    }
  }

  return (
    <div className="card p-5 mb-6">
      <div className="font-display text-lg text-bark-900 mb-1">Extra production (no invoice)</div>
      <p className="text-xs text-bark-800/60 mb-3">
        Work that has no invoice, like Fini sicilians, Ben E. Keith par-bake batards or JetBlue sliders. It adds to the
        expected shaping hours for this production day. It does not count as revenue and does not show on the floor sheets.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {EXTRA_PRESETS.map(p => (
          <button key={p.project} className="btn-secondary" onClick={() => add(p.project, p.cls)}>+ {p.project}</button>
        ))}
        <button className="btn-secondary" onClick={() => add('', 'other')}>+ Other</button>
      </div>
      {items.map(x => (
        <div key={x.id} className="flex flex-wrap items-center gap-2 mb-2">
          <input className="input w-64" value={x.project} placeholder="Project" onChange={e => change(x.id, { project: e.target.value })} />
          <select className="input w-44" value={x.cls} onChange={e => change(x.id, { cls: e.target.value as ShapeClass })}>
            {SHAPE_CLASSES.map(c => <option key={c} value={c}>{SHAPE_CLASS_LABELS[c]}</option>)}
          </select>
          <input className="input w-28" type="number" min="0" value={x.units || ''} placeholder="Units"
            onChange={e => change(x.id, { units: parseFloat(e.target.value) || 0 })} />
          <button className="btn-ghost" onClick={() => setItems(prev => prev.filter(y => y.id !== x.id))}>Remove</button>
        </div>
      ))}
      {items.length === 0 && <div className="text-sm text-bark-800/50 mb-2">Nothing added for this day.</div>}
      <button className="btn-primary flex items-center gap-2 mt-2" onClick={save} disabled={!dirty}>
        <Save className="w-4 h-4" /> Save extra production
      </button>
    </div>
  )
}


// ─── DAILY PERFORMANCE ───────────────────────────────────────────────────────
function PerformanceTab({
  date, setDate, loading, pack, shape, mixBake, mixLog, revenue, invoices, standards, roster, setRoster, day,
}: {
  date: string
  setDate: (d: string) => void
  loading: boolean
  pack: ReturnType<typeof computePack>
  shape: ReturnType<typeof computeShape>
  mixBake: ReturnType<typeof computeMixBake>
  mixLog: MixLogDay | null
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
  const [rackHrs, setRackHrs] = useState('')
  const [deckHrs, setDeckHrs] = useState('')
  const [revOverride, setRevOverride] = useState('')
  const [notes, setNotes] = useState({ general: '', packaging: '', production: '' })

  // Load the saved day's values into the form when the date/day changes.
  useEffect(() => {
    setWorkcell(day?.actualWorkcellHours ? String(day.actualWorkcellHours) : '')
    setRackHrs(day?.actualRackHours ? String(day.actualRackHours) : '')
    setDeckHrs(day?.actualDeckHours ? String(day.actualDeckHours) : '')
    setRevOverride(day?.revenueOverride ? String(day.revenueOverride) : '')
    setNotes({
      general: day?.notes?.general || '',
      packaging: day?.notes?.packaging || '',
      production: day?.notes?.production || '',
    })
  }, [day?.date, day?.uploadedAt, day?.actualWorkcellHours, day?.actualRackHours, day?.actualDeckHours, day?.revenueOverride])

  const hasHours = !!day?.uploadedAt
  const totalHours = hasHours ? (day?.totalHours ?? 0) : null
  const packHours = hasHours ? (day?.packHours ?? 0) : null
  const prodHours = hasHours ? (day?.productionHours ?? 0) : null
  const wcActual = parseFloat(workcell) > 0 ? parseFloat(workcell) : null
  const revenueUsed = parseFloat(revOverride) > 0 ? parseFloat(revOverride) : revenue

  // Mixing: hours and kilos come from the Mix Log on the Production page.
  const mixHoursActual = mixLog && mixLogHours(mixLog) > 0 ? mixLogHours(mixLog) : null
  const kgLogged = mixLogKg(mixLog)
  const mixKgUsed = kgLogged > 0 ? kgLogged : mixBake.mixKg
  const mixExpected = standards.mixKgPerHour > 0 ? mixKgUsed / standards.mixKgPerHour : 0
  // Baking: oven running time typed from the oven logs.
  const rackActual = parseFloat(rackHrs) > 0 ? parseFloat(rackHrs) : null
  const deckActual = parseFloat(deckHrs) > 0 ? parseFloat(deckHrs) : null
  const bakeActual = rackActual !== null || deckActual !== null ? (rackActual ?? 0) + (deckActual ?? 0) : null
  const bakeExpected = mixBake.rackHours + mixBake.deckHours

  // Overall efficiency covers every department that has actual hours entered.
  const scope: { label: string; expected: number; actual: number | null }[] = [
    { label: 'packing', expected: pack.expectedHours, actual: packHours },
    { label: 'shaping', expected: shape.workcellHours, actual: wcActual },
    { label: 'mixing', expected: mixExpected, actual: mixHoursActual },
    { label: 'baking', expected: bakeExpected, actual: bakeActual },
  ]
  const counted = scope.filter(x => x.actual !== null)
  const scopeExpected = counted.reduce((s, x) => s + x.expected, 0)
  const scopeActual = counted.length ? counted.reduce((s, x) => s + (x.actual as number), 0) : null
  const overallPct = scopeActual !== null ? efficiencyPct(scopeExpected, scopeActual) : null
  const overallStatus = efficiencyStatus(overallPct, standards)
  const missingDepts = scope.filter(x => x.actual === null).map(x => x.label)

  const knownActual = (packHours ?? 0) + (wcActual ?? 0) + (mixHoursActual ?? 0) + (bakeActual ?? 0)
  const otherActual = totalHours !== null ? Math.max(totalHours - knownActual, 0) : null
  const overCounted = totalHours !== null && knownActual > totalHours + 0.01
  const expSegments: Segment[] = [
    { label: 'Packing', hours: pack.expectedHours }, { label: 'Shaping', hours: shape.workcellHours },
    { label: 'Mixing', hours: mixExpected }, { label: 'Baking', hours: bakeExpected },
  ]
  const actSegments: Segment[] = [
    { label: 'Packing', hours: packHours }, { label: 'Shaping', hours: wcActual },
    { label: 'Mixing', hours: mixHoursActual }, { label: 'Baking', hours: bakeActual },
    { label: 'Other', hours: otherActual },
  ]
  const barScale = Math.max(
    expSegments.reduce((s, x) => s + (x.hours || 0), 0),
    actSegments.reduce((s, x) => s + (x.hours || 0), 0), 1,
  )

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
        actualRackHours: rackActual,
        actualDeckHours: deckActual,
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
      mixHours: mixHoursActual, mixKg: mixKgUsed > 0 ? mixKgUsed : null,
      rackHours: rackActual, deckHours: deckActual, plannedRacks: mixBake.rackEquivalents,
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
        <StatCard label="Expected labor hours" value={h1(pack.expectedHours + shape.workcellHours + mixExpected + bakeExpected)}
          sub={`pack ${h1(pack.expectedHours)} · shape ${h1(shape.workcellHours)} · mix ${h1(mixExpected)} · bake ${h1(bakeExpected)}`} />
        <StatCard label="Actual labor hours" value={totalHours !== null ? h1(totalHours) : '—'}
          sub={hasHours ? `packing ${h1(packHours ?? 0)} · production ${h1(prodHours ?? 0)}` : 'Upload the Gusto file'} />
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-bark-800/60">Labor efficiency</div>
          <div className="font-display text-3xl mt-1" style={{ color: STATUS_COLOR[overallStatus] }}>
            {overallPct === null ? '—' : `${overallPct.toFixed(0)}%`}
          </div>
          <div className="text-xs text-bark-800/60 mt-1">
            {counted.length ? `counts: ${counted.map(x => x.label).join(', ')}` : 'enter actual hours'}
            {missingDepts.length > 0 && counted.length > 0 ? ` (no actuals yet: ${missingDepts.join(', ')})` : ''}
          </div>
        </div>
        <StatCard label="Revenue per labor hour"
          value={totalHours ? `$${(revenueUsed / totalHours).toFixed(0)}` : '—'}
          sub={`${money(revenueUsed)} revenue · labor % arrives with pay rates`} />
      </div>

      <ExtraProduction date={date} extra={day?.extra || []} />

      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-3">Full production day</div>
        <StackedBar title="Expected" segments={expSegments} scale={barScale} />
        <StackedBar title={hasHours ? 'Actual (Gusto total)' : 'Actual (upload Gusto hours for the total)'} segments={actSegments} scale={barScale} />
        <Legend />
        <div className="text-xs mt-2" style={{ color: overCounted ? STATUS_COLOR.poor : undefined }}>
          {overCounted
            ? 'The department hours add up to more than the Gusto total. Check the hours entered below.'
            : <span className="text-bark-800/50">"Other" is whatever is left of the Gusto total: cleaning, support and any department with no hours entered.</span>}
        </div>
      </div>

      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-4">Department performance</div>
        <EffBar label="Packing (incl. slicing)" expected={pack.expectedHours} actual={packHours} standards={standards} />
        <EffBar
          label="Shaping" expected={shape.workcellHours} actual={wcActual} standards={standards}
          note={[wcActual === null ? 'Enter actual shaping workcell hours below. ' : '', shape.extraWorkcellHours > 0 ? `Includes ${h1(shape.extraWorkcellHours)} h of extra production.` : ''].join('')}
        />
        <EffBar
          label="Mixing" expected={mixExpected} actual={mixHoursActual} standards={standards}
          note={mixHoursActual === null
            ? 'No mix log for this day yet (Production page → Mix Log).'
            : `${Math.round(mixKgUsed)} kg ${kgLogged > 0 ? 'logged' : 'planned'} · ${(mixKgUsed / mixHoursActual).toFixed(0)} kg per mix hour (standard ${standards.mixKgPerHour}).`}
        />
        <EffBar
          label="Baking (oven hours)" expected={bakeExpected} actual={bakeActual} standards={standards}
          note={bakeActual === null ? 'Enter rack and deck oven hours below. ' : `Rack ${h1(rackActual ?? 0)} of ${h1(mixBake.rackHours)} h · deck ${h1(deckActual ?? 0)} of ${h1(mixBake.deckHours)} h.`}
        />
        <div className="text-xs text-bark-800/50">
          Cleaning and support have no standard yet, so they show as "Other" in the bar above.
        </div>
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
            <label className="label">Actual rack oven hours (oven running time)</label>
            <input className="input" type="number" min="0" step="0.25" value={rackHrs} onChange={e => setRackHrs(e.target.value)}
              placeholder={`Planned: ${h1(mixBake.rackHours)}`} />
          </div>
          <div>
            <label className="label">Actual deck oven hours (oven running time)</label>
            <input className="input" type="number" min="0" step="0.25" value={deckHrs} onChange={e => setDeckHrs(e.target.value)}
              placeholder={`Planned: ${h1(mixBake.deckHours)}`} />
          </div>
          <div>
            <label className="label">Revenue override (optional, e.g. from FreshBooks)</label>
            <input className="input" type="number" min="0" step="0.01" value={revOverride} onChange={e => setRevOverride(e.target.value)}
              placeholder={`OMS total: ${money(revenue)}`} />
          </div>
        </div>
        <p className="text-xs text-bark-800/50 mt-3">Mixing hours and kilos are not typed here. They come from the Mix Log on the Production page.</p>
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
  standards, setStandards, roster, setRoster, products, shapeMap, setShapeMap,
}: {
  standards: LaborStandards
  setStandards: (s: LaborStandards) => void
  roster: Roster
  setRoster: (r: Roster) => void
  products: Product[]
  shapeMap: ShapeMap
  setShapeMap: (m: ShapeMap) => void
}) {
  const [draft, setDraft] = useState<LaborStandards>(standards)
  const [exclText, setExclText] = useState(standards.excludedCustomers.join(', '))
  const [typeSearch, setTypeSearch] = useState('')
  useEffect(() => {
    setDraft(standards)
    setExclText(standards.excludedCustomers.join(', '))
  }, [standards])

  // One row per product name (the database can hold duplicate names); a choice applies to all of them.
  const typeRows = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; ids: string[] }>()
    products
      .filter(p => p.active !== false && !p.isSchripps)
      .forEach(p => {
        const key = p.name.trim().toLowerCase()
        const g = groups.get(key)
        if (g) g.ids.push(p.id)
        else groups.set(key, { key, name: p.name, ids: [p.id] })
      })
    const q = typeSearch.trim().toLowerCase()
    return Array.from(groups.values())
      .map(g => {
        const auto = shapeClassOf(g.name)
        const chosen = (shapeMap[g.ids[0]] || '') as ShapeClass | ''
        return { ...g, auto, chosen, needsReview: !chosen && auto === 'other' }
      })
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.needsReview) - Number(a.needsReview) || a.name.localeCompare(b.name))
  }, [products, shapeMap, typeSearch])

  async function setType(ids: string[], v: ShapeClass | '') {
    const next: ShapeMap = { ...shapeMap }
    ids.forEach(id => { if (v) next[id] = v; else delete next[id] })
    try {
      await laborDb.saveShapeMap(next)
      setShapeMap(next)
    } catch {
      toast.error('Could not save')
    }
  }

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
        <div className="font-display text-lg text-bark-900 mb-1">Mixing and baking standards</div>
        <p className="text-xs text-bark-800/60 mb-3">
          Starting points from your 2026 KPI sheet and oven logs. Reset them from your own numbers after a few weeks of mix logs.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {field('Dough kg per mix hour', 'mixKgPerHour', 'Typical ≈ 290, good days ≈ 375')}
          {field('Racks per rack-oven hour', 'rackRacksPerHour', 'Typical 2.5, good days 3+')}
          {field('Loaves per deck-oven hour', 'deckUnitsPerHour', 'Typical ≈ 53, good days 65+')}
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

      <div className="card p-5 mb-6">
        <div className="font-display text-lg text-bark-900 mb-1">Product types (for shaping)</div>
        <p className="text-xs text-bark-800/60 mb-3">
          Each product counts toward one shaping type. "Auto" is a guess from the product name. Pick a type only where the
          guess is wrong. Products with no clear type are listed first.
        </p>
        <input className="input mb-3 w-64" placeholder="Search products" value={typeSearch} onChange={e => setTypeSearch(e.target.value)} />
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="table-base">
            <thead><tr><th>Product</th><th>Type</th></tr></thead>
            <tbody>
              {typeRows.map(r => (
                <tr key={r.key}>
                  <td>{r.name}{r.needsReview && <span className="badge-ember ml-2">review</span>}</td>
                  <td>
                    <select className="input w-56" value={r.chosen} onChange={e => setType(r.ids, e.target.value as ShapeClass | '')}>
                      <option value="">{`Auto (${SHAPE_CLASS_LABELS[r.auto]})`}</option>
                      {SHAPE_CLASSES.map(c => <option key={c} value={c}>{SHAPE_CLASS_LABELS[c]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
