'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useAuth } from '@/lib/auth-context'
import { useProducts } from '@/lib/useProducts'
import { customersService, ordersService } from '@/lib/db'
import { laborDb } from '@/lib/laborDb'
import { ingredientsDb } from '@/lib/ingredientsDb'
import { INGREDIENT_ROWS, WeekInput } from '@/lib/ingredients'
import {
  DEFAULT_STANDARDS, LaborDay, LaborStandards, MixLogDay, Roster, ShapeMap, deliveryDatesFor, weekStartMonday,
} from '@/lib/labor'
import {
  DEFAULT_DISTRO, DEFAULT_PRICES, DaySnapshot, DistroSettings, IngredientCost, Status, WeekRollup,
  computeDayKpi, dailyNumbers, schrippsWeeksFor, statusesFor, weekDatesMon, weekRollup, weeklyIngredientCost,
} from '@/lib/kpi'
import type { Customer } from '@/types'
import { addDays, format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, RefreshCw, Save } from 'lucide-react'

const WEEKS_SHOWN = 8
const COLORS: Record<Status, string> = { good: '#4a7c59', ok: '#c4943a', poor: '#c0392b', none: '#cbd5e0' }
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const money2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct1 = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`)
const shiftDays = (iso: string, n: number) => format(addDays(parseISO(iso), n), 'yyyy-MM-dd')
const shortDate = (iso: string) => format(parseISO(iso), 'MMM d')

interface WeekData {
  weekStart: string
  days: (LaborDay | null)[]
  snaps: DaySnapshot[]
  snapDates: string[]
  missingKpi: string[]          // days with Gusto hours but no saved summary yet
  logs: (MixLogDay | null)[]
  ingredients: IngredientCost | null
  rollup: WeekRollup | null
}

// ─── small pieces ────────────────────────────────────────────────────────────
function Kpi({ label, value, status, sub, delta }: { label: string; value: string; status: Status; sub?: string; delta?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-bark-800/60">{label}</div>
      <div className="font-display text-3xl mt-1" style={{ color: COLORS[status] }}>{value}</div>
      {delta && <div className="text-xs mt-1 text-bark-800/70">{delta}</div>}
      {sub && <div className="text-xs text-bark-800/50 mt-1">{sub}</div>}
    </div>
  )
}

interface Series { label: string; color: string; values: (number | null)[] }
function TrendChart({
  title, labels, series, refs = [], fmt,
}: {
  title: string
  labels: string[]
  series: Series[]
  refs?: { y: number; label: string }[]
  fmt: (n: number) => string
}) {
  const W = 560, H = 190, L = 44, R = 12, T = 12, B = 28
  const nums = series.flatMap(s => s.values).filter((v): v is number => v !== null)
  const all = [...nums, ...refs.map(r => r.y)]
  const hasData = nums.length > 0
  let lo = all.length ? Math.min(...all) : 0
  let hi = all.length ? Math.max(...all) : 1
  if (hi === lo) { hi = lo + 1 }
  const pad = (hi - lo) * 0.12
  lo = Math.max(0, lo - pad); hi = hi + pad
  const x = (i: number) => L + (labels.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (labels.length - 1))
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const ticks = [lo, (lo + hi) / 2, hi]
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-1 gap-3">
        <div className="font-medium text-bark-900">{title}</div>
        <div className="flex gap-3 text-xs text-bark-800/70">
          {series.map(s => (
            <span key={s.label} className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: s.color }} />{s.label}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e8dcc8" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#7a6040">{fmt(t)}</text>
          </g>
        ))}
        {refs.map(r => (
          <g key={r.label}>
            <line x1={L} x2={W - R} y1={y(r.y)} y2={y(r.y)} stroke="#4a7c59" strokeWidth="1" strokeDasharray="4 3" />
            <text x={W - R} y={y(r.y) - 3} textAnchor="end" fontSize="9" fill="#4a7c59">{r.label}</text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#7a6040">{l}</text>
        ))}
        {hasData && series.map(s => {
          const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as [number, number]))
          // draw separate segments so a missing week leaves a gap
          const segs: [number, number][][] = []
          let cur: [number, number][] = []
          pts.forEach(p => { if (p) cur.push(p); else { if (cur.length) segs.push(cur); cur = [] } })
          if (cur.length) segs.push(cur)
          return (
            <g key={s.label}>
              {segs.map((seg, i) => (
                <polyline key={i} points={seg.map(p => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2" />
              ))}
              {pts.map((p, i) => p && (
                <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={s.color}>
                  <title>{`${s.label} ${labels[i]}: ${fmt(s.values[i] as number)}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
        {!hasData && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="12" fill="#7a6040">No data yet</text>}
      </svg>
    </div>
  )
}

function delta(cur: number | null, prev: number | null, fmt: (n: number) => string, lowerBetter = false): string | undefined {
  if (cur === null || prev === null) return undefined
  const d = cur - prev
  if (Math.abs(d) < 0.005) return 'same as last week'
  const better = lowerBetter ? d < 0 : d > 0
  return `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))} vs last week${better ? '' : ' (worse)'}`
}

// ─── page ─────────────────────────────────────────────────────────────────────
export default function KpiDashboardPage() {
  const { appUser } = useAuth()
  const isAdmin = appUser?.role === 'admin'
  const { products } = useProducts()

  const [weekStart, setWeekStart] = useState(() => weekStartMonday(format(new Date(), 'yyyy-MM-dd')))
  const [standards, setStandards] = useState<LaborStandards>(DEFAULT_STANDARDS)
  const [roster, setRoster] = useState<Roster>({})
  const [shapeMap, setShapeMap] = useState<ShapeMap>({})
  const [distro, setDistro] = useState<DistroSettings>(DEFAULT_DISTRO)
  const [prices, setPrices] = useState<Record<string, number>>(DEFAULT_PRICES)
  const [cfgReady, setCfgReady] = useState(false)
  const [weeks, setWeeks] = useState<WeekData[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [filling, setFilling] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([
      laborDb.getStandards().then(setStandards),
      laborDb.getRoster().then(setRoster),
      laborDb.getShapeMap().then(setShapeMap),
      laborDb.getDistro().then(setDistro),
      laborDb.getPrices().then(setPrices),
    ]).then(() => setCfgReady(true)).catch(() => toast.error('Could not load settings'))
  }, [isAdmin])

  const weekStarts = useMemo(
    () => Array.from({ length: WEEKS_SHOWN }, (_, i) => shiftDays(weekStart, -7 * (WEEKS_SHOWN - 1 - i))),
    [weekStart],
  )

  // Load the saved days, mix logs and typed ingredient counts for every week shown.
  useEffect(() => {
    if (!isAdmin || !cfgReady) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const schrippsEndings = Array.from(new Set(weekStarts.flatMap(schrippsWeeksFor)))
        const [dayLists, logLists, wkDocs] = await Promise.all([
          Promise.all(weekStarts.map(ws => laborDb.getDays(weekDatesMon(ws)))),
          Promise.all(weekStarts.map(ws => Promise.all(weekDatesMon(ws).map(d => laborDb.getMixLog(d))))),
          Promise.all(schrippsEndings.map(we => ingredientsDb.getWeek(we))),
        ])
        const byEnding: Record<string, WeekInput | null> = {}
        schrippsEndings.forEach((we, i) => { byEnding[we] = wkDocs[i] ? { counts: wkDocs[i]!.counts, fixed: wkDocs[i]!.fixed, kiloOverrides: wkDocs[i]!.kiloOverrides } : null })
        const out: WeekData[] = weekStarts.map((ws, wi) => {
          const days = dayLists[wi]
          const dates = weekDatesMon(ws)
          const snaps: DaySnapshot[] = []
          const snapDates: string[] = []
          const missingKpi: string[] = []
          days.forEach((d, i) => {
            if (!d?.uploadedAt) return
            if (d.kpi) { snaps.push(d.kpi); snapDates.push(dates[i]) } else missingKpi.push(dates[i])
          })
          const logs = logLists[wi]
          const ingredients = snaps.length ? weeklyIngredientCost(ws, logs, byEnding, prices, snapDates) : null
          const rollup = snaps.length ? weekRollup(ws, snaps, ingredients ? ingredients.total : 0, distro) : null
          return { weekStart: ws, days, snaps, snapDates, missingKpi, logs, ingredients, rollup }
        })
        if (!cancelled) setWeeks(out)
      } catch {
        if (!cancelled) toast.error('Could not load the dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isAdmin, cfgReady, weekStarts, reloadKey, prices, distro])

  const current = weeks[weeks.length - 1]
  const previous = weeks[weeks.length - 2]
  const cur = current?.rollup || null
  const prev = previous?.rollup || null
  const st = cur ? statusesFor({ cplh: cur.cplh, prodCplh: cur.prodCplh, laborPct: cur.laborPct, netPct: cur.netPct, avgInvoice: cur.avgInvoice }, standards) : null

  const missingAll = weeks.flatMap(w => w.missingKpi)

  // Days uploaded before the dashboard existed have no saved summary yet; build them from the orders.
  async function fillMissing() {
    if (!missingAll.length) return
    setFilling(true)
    try {
      const customers: Customer[] = await customersService.getAll()
      for (const date of missingAll) {
        const [dayArr, mixLog, ...orderLists] = await Promise.all([
          laborDb.getDays([date]),
          laborDb.getMixLog(date),
          ...deliveryDatesFor(date).map(d => ordersService.getByDate(d)),
        ])
        const dk = computeDayKpi({
          orders: (orderLists as any[]).flat(), customers, products, standards, shapeMap, roster, day: dayArr[0], mixLog,
        })
        if (dk.snapshot) await laborDb.saveKpi(date, dk.snapshot)
      }
      toast.success(`Filled ${missingAll.length} day${missingAll.length === 1 ? '' : 's'}`)
      setReloadKey(k => k + 1)
    } catch {
      toast.error('Could not fill the missing days')
    } finally {
      setFilling(false)
    }
  }

  if (!appUser) return <AppShell><div className="p-6 text-bark-800/60">Checking access…</div></AppShell>
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="card p-8 max-w-lg">
          <h1 className="section-header">KPI Dashboard</h1>
          <p className="text-bark-800/70 mt-2">This page is available to admins only.</p>
        </div>
      </AppShell>
    )
  }

  const labels = weeks.map(w => shortDate(w.weekStart))
  const series = (f: (r: WeekRollup) => number | null) => weeks.map(w => (w.rollup ? f(w.rollup) : null))
  const weekEnd = shiftDays(weekStart, 6)

  return (
    <AppShell>
      <div className="max-w-5xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h1 className="section-header">KPI Dashboard</h1>
            <p className="text-bark-800/60 text-sm">
              Week of {format(parseISO(weekStart), 'MMM d')} to {format(parseISO(weekEnd), 'MMM d, yyyy')} · weekly numbers use actual distribution and ingredient costs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setWeekStart(shiftDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></button>
            <input type="date" className="input w-40" value={weekStart}
              onChange={e => e.target.value && setWeekStart(weekStartMonday(e.target.value))} />
            <button className="btn-secondary" onClick={() => setWeekStart(shiftDays(weekStart, 7))} aria-label="Next week"><ChevronRight className="w-4 h-4" /></button>
            <button className="btn-secondary" onClick={() => setReloadKey(k => k + 1)} aria-label="Refresh"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>

        {missingAll.length > 0 && (
          <div className="card p-4 mb-5 border border-wheat-400 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-bark-800/80">
              {missingAll.length} day{missingAll.length === 1 ? '' : 's'} with Gusto hours {missingAll.length === 1 ? 'has' : 'have'} no saved KPI numbers yet
              ({missingAll.slice(0, 4).map(shortDate).join(', ')}{missingAll.length > 4 ? '…' : ''}).
              Days fill in by themselves when you open them on the Labor page, or you can fill them all now.
            </div>
            <button className="btn-primary" onClick={fillMissing} disabled={filling}>{filling ? 'Filling…' : 'Fill missing days'}</button>
          </div>
        )}

        {loading && <div className="text-bark-800/60 mb-3">Loading…</div>}

        {!loading && !cur && (
          <div className="card p-6 text-bark-800/70 mb-6">
            No days with Gusto hours and saved numbers in this week yet. Upload the Gusto file on the Labor page (Daily Performance tab) for each day.
          </div>
        )}

        {cur && st && current && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <Kpi label="CPLH" value={cur.cplh !== null ? `$${cur.cplh.toFixed(0)}` : '—'} status={st.cplh}
                delta={delta(cur.cplh, prev?.cplh ?? null, n => `$${n.toFixed(0)}`)}
                sub={`net contribution per labor hour · ${cur.totalHours.toFixed(1)} h`} />
              <Kpi label="Production CPLH" value={cur.prodCplh !== null ? `$${cur.prodCplh.toFixed(0)}` : '—'} status={st.prodCplh}
                delta={delta(cur.prodCplh, prev?.prodCplh ?? null, n => `$${n.toFixed(0)}`)}
                sub="excludes pack hours" />
              <Kpi label="Labor %" value={pct1(cur.laborPct)} status={st.laborPct}
                delta={delta(cur.laborPct, prev?.laborPct ?? null, n => `${n.toFixed(1)} pts`, true)}
                sub={`${money(cur.laborDollars)} of ${money(cur.revenue)}`} />
              <Kpi label="Net contribution %" value={pct1(cur.netPct)} status={st.netPct}
                delta={delta(cur.netPct, prev?.netPct ?? null, n => `${n.toFixed(1)} pts`)}
                sub={`${money(cur.netContribution)} net`} />
              <Kpi label="Revenue" value={money(cur.revenue)} status="none"
                delta={delta(cur.revenue, prev?.revenue ?? null, n => money(n))}
                sub={`${cur.daysWithData} day${cur.daysWithData === 1 ? '' : 's'} counted · ${cur.invoices} invoices`} />
              <Kpi label="Average invoice" value={cur.avgInvoice !== null ? money(cur.avgInvoice) : '—'} status={st.avgInvoice}
                delta={delta(cur.avgInvoice, prev?.avgInvoice ?? null, n => money(n))} />
            </div>

            {(current.ingredients?.missingWeeks.length || 0) > 0 && (
              <div className="card p-3 mb-3 text-sm" style={{ color: COLORS.poor }}>
                Ingredient counts are not typed in yet for the Schripps week ending {current.ingredients!.missingWeeks.map(shortDate).join(' and ')}.
                Flour, eggs, milk, yeast, butter and oils are left out, so ingredients and net contribution look too good until you enter them on the Ingredients page.
              </div>
            )}
            {current.ingredients && current.ingredients.daysWithMixLog < current.snaps.length && (
              <div className="card p-3 mb-3 text-sm" style={{ color: COLORS.ok }}>
                Mix Log is missing for {current.snaps.length - current.ingredients.daysWithMixLog} counted day(s), so sugar, salt, malt, honey and seeds are understated.
              </div>
            )}

            <div className="card p-5 mb-6">
              <div className="font-display text-lg text-bark-900 mb-3">Where the week's revenue went</div>
              <table className="table-base">
                <thead><tr><th>Line</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>% of revenue</th></tr></thead>
                <tbody>
                  {([
                    ['Revenue', cur.revenue, true],
                    [`Distribution (ALLNP ${money(cur.distro.allnp)} · Featherstone ${money(cur.distro.fs)} · MRS ${money(cur.distro.mrs)})`, -cur.distro.total, false],
                    ['Ingredients', -cur.ingredients, false],
                    ['Packaging', -cur.packaging, false],
                    ['Gross contribution', cur.grossContribution, true],
                    ['Labor', -cur.laborDollars, false],
                    ['Net contribution', cur.netContribution, true],
                  ] as [string, number, boolean][]).map(([label, amt, bold]) => (
                    <tr key={label} style={bold ? { fontWeight: 600 } : undefined}>
                      <td>{label}</td>
                      <td style={{ textAlign: 'right' }}>{amt < 0 ? `−${money(-amt)}` : money(amt)}</td>
                      <td style={{ textAlign: 'right' }}>{cur.revenue > 0 ? `${((Math.abs(amt) / cur.revenue) * 100).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {weeks.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <TrendChart title="CPLH ($ per labor hour)" labels={labels} fmt={n => `$${n.toFixed(0)}`}
              series={[
                { label: 'CPLH', color: '#c4943a', values: series(r => r.cplh) },
                { label: 'Production', color: '#8b6355', values: series(r => r.prodCplh) },
              ]}
              refs={[{ y: standards.cplhGreen, label: `target $${standards.cplhGreen}` }]} />
            <TrendChart title="Labor % and net contribution %" labels={labels} fmt={n => `${n.toFixed(0)}%`}
              series={[
                { label: 'Labor %', color: '#b5532a', values: series(r => r.laborPct) },
                { label: 'Net %', color: '#4a7c59', values: series(r => r.netPct) },
              ]}
              refs={[{ y: standards.laborPctGreen, label: `labor ≤ ${standards.laborPctGreen}%` }]} />
            <TrendChart title="Revenue" labels={labels} fmt={n => `$${Math.round(n / 1000)}k`}
              series={[{ label: 'Revenue', color: '#7a8b55', values: series(r => r.revenue) }]} />
            <TrendChart title="Distribution and ingredients (% of revenue)" labels={labels} fmt={n => `${n.toFixed(0)}%`}
              series={[
                { label: 'Distribution', color: '#8b6355', values: series(r => r.distroPct) },
                { label: 'Ingredients', color: '#c4943a', values: series(r => r.ingredientsPct) },
              ]} />
          </div>
        )}

        {current && <DailyTable week={current} standards={standards} />}
        {current && cur && <Details week={current} rollup={cur} />}

        <SettingsCard
          weekStart={weekStart} distro={distro} setDistro={setDistro} prices={prices} setPrices={setPrices}
          routesSeen={cur ? cur.distro.routes.map(r => r.route) : []}
        />
      </div>
    </AppShell>
  )
}

// ─── daily table ──────────────────────────────────────────────────────────────
function DailyTable({ week, standards }: { week: WeekData; standards: LaborStandards }) {
  const dates = weekDatesMon(week.weekStart)
  return (
    <div className="card p-5 mb-6">
      <div className="font-display text-lg text-bark-900 mb-1">Day by day</div>
      <p className="text-xs text-bark-800/60 mb-3">
        Daily numbers assume {standards.grossMarginPct}% gross margin (no daily ingredient breakdown). The weekly numbers above use actuals.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="table-base">
          <thead>
            <tr>
              <th>Day</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>Hours</th>
              <th style={{ textAlign: 'right' }}>Labor $</th><th style={{ textAlign: 'right' }}>Labor %</th>
              <th style={{ textAlign: 'right' }}>Net</th><th style={{ textAlign: 'right' }}>CPLH</th>
              <th style={{ textAlign: 'right' }}>Prod CPLH</th><th style={{ textAlign: 'right' }}>Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date, i) => {
              const day = week.days[i]
              const snap = day?.kpi
              if (!day?.uploadedAt) {
                return <tr key={date} style={{ opacity: 0.45 }}><td>{format(parseISO(date), 'EEE MMM d')}</td><td colSpan={8}>no hours uploaded</td></tr>
              }
              if (!snap) {
                return <tr key={date}><td>{format(parseISO(date), 'EEE MMM d')}</td><td colSpan={8}>numbers not saved yet</td></tr>
              }
              const n = dailyNumbers(snap, standards)
              const s = statusesFor({ cplh: n.cplh, prodCplh: n.prodCplh, laborPct: n.laborPct, netPct: n.netPct }, standards)
              return (
                <tr key={date}>
                  <td>{format(parseISO(date), 'EEE MMM d')}</td>
                  <td style={{ textAlign: 'right' }}>{money(n.revenue)}</td>
                  <td style={{ textAlign: 'right' }}>{snap.totalHours.toFixed(1)}</td>
                  <td style={{ textAlign: 'right' }}>{money(n.laborDollars)}</td>
                  <td style={{ textAlign: 'right', color: COLORS[s.laborPct], fontWeight: 600 }}>{pct1(n.laborPct)}</td>
                  <td style={{ textAlign: 'right' }}>{money(n.netContribution)}</td>
                  <td style={{ textAlign: 'right', color: COLORS[s.cplh], fontWeight: 600 }}>{n.cplh !== null ? `$${n.cplh.toFixed(0)}` : '—'}</td>
                  <td style={{ textAlign: 'right', color: COLORS[s.prodCplh], fontWeight: 600 }}>{n.prodCplh !== null ? `$${n.prodCplh.toFixed(0)}` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{snap.effPct !== null ? `${snap.effPct.toFixed(0)}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── route and ingredient detail ──────────────────────────────────────────────
function Details({ week, rollup }: { week: WeekData; rollup: WeekRollup }) {
  const d = rollup.distro
  return (
    <details className="card p-4 mb-6">
      <summary className="cursor-pointer text-sm text-bark-800/70">How distribution and ingredients were worked out</summary>
      <div className="grid md:grid-cols-2 gap-6 mt-4">
        <div>
          <div className="font-medium text-bark-900 mb-2">ALLNP by route</div>
          <table className="table-base">
            <thead><tr><th>Route</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>Charge</th></tr></thead>
            <tbody>
              {d.routes.map(r => (
                <tr key={r.route}>
                  <td>{r.route}</td>
                  <td style={{ textAlign: 'right' }}>{money2(r.revenue)}</td>
                  <td style={{ textAlign: 'right' }}>{r.pct}%</td>
                  <td style={{ textAlign: 'right' }}>{money2(r.charge)}</td>
                </tr>
              ))}
              <tr><td colSpan={3}>Fuel surcharge</td><td style={{ textAlign: 'right' }}>{money2(d.allnpFuel)}</td></tr>
              <tr><td colSpan={3}>Chargebacks</td><td style={{ textAlign: 'right' }}>−{money2(d.chargebacks)}</td></tr>
              <tr style={{ fontWeight: 600 }}><td colSpan={3}>ALLNP total</td><td style={{ textAlign: 'right' }}>{money2(d.allnp)}</td></tr>
              <tr><td colSpan={3}>Featherstone</td><td style={{ textAlign: 'right' }}>{money2(d.fs)}</td></tr>
              <tr><td colSpan={3}>MRS</td><td style={{ textAlign: 'right' }}>{money2(d.mrs)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className="font-medium text-bark-900 mb-2">Ingredients</div>
          <table className="table-base">
            <thead><tr><th>Ingredient</th><th style={{ textAlign: 'right' }}>kg</th><th style={{ textAlign: 'right' }}>$/kg</th><th style={{ textAlign: 'right' }}>Cost</th></tr></thead>
            <tbody>
              {(week.ingredients?.rows || []).sort((a, b) => b.cost - a.cost).map(r => (
                <tr key={r.key}>
                  <td>{r.label}<span className="text-bark-800/40 text-xs"> {r.source === 'mix' ? 'from Mix Log' : 'typed weekly'}</span></td>
                  <td style={{ textAlign: 'right' }}>{r.qty.toFixed(1)}</td>
                  <td style={{ textAlign: 'right' }}>{r.price.toFixed(3)}</td>
                  <td style={{ textAlign: 'right' }}>{money2(r.cost)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}><td colSpan={3}>Total</td><td style={{ textAlign: 'right' }}>{money2(rollup.ingredients)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-bark-800/50 mt-2">
            Typed amounts are for the Schripps week (Wed to Tue) and are spread evenly over its days. Packaging is {money2(rollup.packaging)} (a % of revenue).
          </p>
        </div>
      </div>
    </details>
  )
}

// ─── settings ─────────────────────────────────────────────────────────────────
function SettingsCard({
  weekStart, distro, setDistro, prices, setPrices, routesSeen,
}: {
  weekStart: string
  distro: DistroSettings
  setDistro: (d: DistroSettings) => void
  prices: Record<string, number>
  setPrices: (p: Record<string, number>) => void
  routesSeen: string[]
}) {
  const [draft, setDraft] = useState<DistroSettings>(distro)
  const [pr, setPr] = useState<Record<string, number>>(prices)
  const [cb, setCb] = useState('')
  useEffect(() => { setDraft(distro) }, [distro])
  useEffect(() => { setPr(prices) }, [prices])
  useEffect(() => { setCb(distro.chargebacks[weekStart] ? String(distro.chargebacks[weekStart]) : '') }, [weekStart, distro])

  const num = (v: string) => (v === '' ? 0 : parseFloat(v) || 0)
  const routes = useMemo(
    () => Array.from(new Set([...Object.keys(draft.routePct), ...routesSeen])).sort(),
    [draft.routePct, routesSeen],
  )

  const saveDistro = useCallback(async () => {
    const chargebacks = { ...draft.chargebacks }
    const v = parseFloat(cb)
    if (Number.isFinite(v) && v > 0) chargebacks[weekStart] = v
    else delete chargebacks[weekStart]
    const next = { ...draft, chargebacks }
    try {
      await laborDb.saveDistro(next)
      setDistro(next)
      toast.success('Distribution settings saved')
    } catch {
      toast.error('Could not save')
    }
  }, [draft, cb, weekStart, setDistro])

  async function savePrices() {
    try {
      await laborDb.savePrices(pr)
      setPrices(pr)
      toast.success('Prices saved')
    } catch {
      toast.error('Could not save')
    }
  }

  return (
    <details className="card p-4 mb-6">
      <summary className="cursor-pointer text-sm text-bark-800/70">Settings: distributor charges, chargebacks, ingredient prices</summary>
      <div className="mt-4">
        <div className="font-medium text-bark-900 mb-1">ALLNP charge % per route</div>
        <p className="text-xs text-bark-800/60 mb-3">From your NL-RouteRevenue sheet. A route that is not listed uses {draft.defaultRoutePct}%.</p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {routes.map(r => (
            <div key={r}>
              <label className="label">{r}</label>
              <input className="input" type="number" step="0.5" value={draft.routePct[r] ?? ''} placeholder={String(draft.defaultRoutePct)}
                onChange={e => {
                  const rp = { ...draft.routePct }
                  if (e.target.value === '') delete rp[r]; else rp[r] = num(e.target.value)
                  setDraft({ ...draft, routePct: rp })
                }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <div><label className="label">Unlisted route %</label><input className="input" type="number" step="0.5" value={draft.defaultRoutePct} onChange={e => setDraft({ ...draft, defaultRoutePct: num(e.target.value) })} /></div>
          <div><label className="label">ALLNP fuel surcharge %</label><input className="input" type="number" step="0.5" value={draft.allnpFuelPct} onChange={e => setDraft({ ...draft, allnpFuelPct: num(e.target.value) })} /></div>
          <div><label className="label">Featherstone %</label><input className="input" type="number" step="0.5" value={draft.fsPct} onChange={e => setDraft({ ...draft, fsPct: num(e.target.value) })} /></div>
          <div><label className="label">MRS %</label><input className="input" type="number" step="0.5" value={draft.mrsPct} onChange={e => setDraft({ ...draft, mrsPct: num(e.target.value) })} /></div>
          <div><label className="label">Packaging % of revenue</label><input className="input" type="number" step="0.5" value={draft.packagingPct} onChange={e => setDraft({ ...draft, packagingPct: num(e.target.value) })} /></div>
        </div>
        <div className="mt-4 max-w-xs">
          <label className="label">ALLNP chargebacks for the week of {shortDate(weekStart)} ($)</label>
          <input className="input" type="number" min="0" step="0.01" value={cb} onChange={e => setCb(e.target.value)} placeholder="0" />
        </div>
        <button className="btn-primary flex items-center gap-2 mt-4" onClick={saveDistro}><Save className="w-4 h-4" /> Save distribution settings</button>

        <div className="font-medium text-bark-900 mt-8 mb-1">Ingredient prices ($ per kg, marked up)</div>
        <p className="text-xs text-bark-800/60 mb-3">The "Marked $/KG" column of your INGR_COST sheet. Assumes the amounts on the Ingredients page are in kg.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {INGREDIENT_ROWS.filter(r => r.kind === 'count' || r.kind === 'kilo').map(r => (
            <div key={r.key}>
              <label className="label">{r.label}</label>
              <input className="input" type="number" step="0.001" value={pr[r.key] ?? ''} placeholder="not priced"
                onChange={e => {
                  const next = { ...pr }
                  if (e.target.value === '') delete next[r.key]; else next[r.key] = num(e.target.value)
                  setPr(next)
                }} />
            </div>
          ))}
        </div>
        <button className="btn-primary flex items-center gap-2 mt-4" onClick={savePrices}><Save className="w-4 h-4" /> Save prices</button>
      </div>
    </details>
  )
}
