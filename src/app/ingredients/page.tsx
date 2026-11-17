'use client'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useAuth } from '@/lib/auth-context'
import { ingredientsDb } from '@/lib/ingredientsDb'
import {
  INGREDIENT_ROWS, KiloResult, WeekInput, buildColumnC, columnCText, computeKilos,
  latestWeekEnding, shiftWeek, weekDates,
} from '@/lib/ingredients'
import { MIX_DOUGHS, MixLogDay } from '@/lib/labor'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { Copy, Save, ChevronLeft, ChevronRight } from 'lucide-react'

const EMPTY: WeekInput = { counts: {}, fixed: {}, kiloOverrides: {} }
const num = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}
const show = (n: number | null | undefined) => (n == null ? '' : String(n))

export default function IngredientsPage() {
  const { appUser } = useAuth()
  const isAdmin = appUser?.role === 'admin'
  const [weekEnding, setWeekEnding] = useState(() => latestWeekEnding(format(new Date(), 'yyyy-MM-dd')))
  const [input, setInput] = useState<WeekInput>(EMPTY)
  const [saved, setSaved] = useState<string>('')   // JSON of what is stored, to detect unsaved changes
  const [logs, setLogs] = useState<(MixLogDay | null)[]>([])
  const [loading, setLoading] = useState(true)
  const [savedInfo, setSavedInfo] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [week, mix] = await Promise.all([ingredientsDb.getWeek(weekEnding), ingredientsDb.getMixLogs(weekEnding)])
        // A week with nothing saved yet starts from last week's fixed values.
        const prev = week ? null : await ingredientsDb.getWeek(shiftWeek(weekEnding, -1))
        if (cancelled) return
        const next: WeekInput = week
          ? { counts: week.counts, fixed: week.fixed, kiloOverrides: week.kiloOverrides }
          : { counts: {}, fixed: prev?.fixed || {}, kiloOverrides: {} }
        setInput(next)
        setSaved(week ? JSON.stringify(next) : '')
        setSavedInfo(week?.updatedAt ? `Saved ${format(parseISO(week.updatedAt), 'EEE MMM d, h:mm a')}${week.updatedBy ? ` by ${week.updatedBy}` : ''}` : '')
        setLogs(mix)
      } catch {
        if (!cancelled) toast.error('Could not load this week')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isAdmin, weekEnding])

  const kilo: KiloResult = useMemo(() => computeKilos(logs), [logs])
  const rows = useMemo(() => buildColumnC(input, kilo), [input, kilo])
  const dirty = JSON.stringify(input) !== saved
  const dates = weekDates(weekEnding)
  const missing = rows.filter(r => r.missing).length

  if (!appUser) return <AppShell><div className="p-6 text-bark-800/60">Checking access…</div></AppShell>
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="card p-8 max-w-lg">
          <h1 className="section-header">Ingredient usage</h1>
          <p className="text-bark-800/70 mt-2">This page is available to admins only.</p>
        </div>
      </AppShell>
    )
  }

  const setCount = (key: string, v: string) => setInput(p => ({ ...p, counts: { ...p.counts, [key]: num(v) } }))
  const setFixed = (key: string, v: string) => setInput(p => ({ ...p, fixed: { ...p.fixed, [key]: num(v) } }))
  const setOverride = (key: string, v: string) => setInput(p => ({ ...p, kiloOverrides: { ...p.kiloOverrides, [key]: num(v) } }))

  async function save() {
    try {
      await ingredientsDb.saveWeek(weekEnding, input, appUser?.email || '')
      setSaved(JSON.stringify(input))
      toast.success('Week saved')
    } catch {
      toast.error('Could not save')
    }
  }

  async function copyColumn() {
    try {
      await navigator.clipboard.writeText(columnCText(rows))
      toast.success('Column C copied. Paste it into the first row (AP Flour) of the Schripps sheet.')
    } catch {
      toast.error('Could not copy. Select the numbers in the table and copy them.')
    }
  }

  const unmapped = Object.entries(kilo.unmappedKg)
  const dough = (id: string) => MIX_DOUGHS.find(d => d.id === id)?.label || id

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h1 className="section-header">Ingredient usage</h1>
            <p className="text-bark-800/60 text-sm">
              Column C for the Schripps usage sheet · week ending {format(parseISO(weekEnding), 'EEE MMM d, yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" aria-label="Previous week" onClick={() => setWeekEnding(shiftWeek(weekEnding, -1))}><ChevronLeft className="w-4 h-4" /></button>
            <input type="date" className="input w-44" value={weekEnding}
              onChange={e => e.target.value && setWeekEnding(latestWeekEnding(e.target.value))} />
            <button className="btn-secondary" aria-label="Next week" onClick={() => setWeekEnding(shiftWeek(weekEnding, 1))}><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="card p-4 mb-4 text-sm text-bark-800/80">
          <div>
            <b>Kilo rows</b> come from David's Mix Log for {format(parseISO(dates[0]), 'EEE MMM d')} to {format(parseISO(dates[6]), 'EEE MMM d')}:
            {' '}{loading ? 'loading…' : <><b>{kilo.daysWithLog} of 7</b> days have a log, {kilo.totalKg.toFixed(0)} kg of dough mixed.</>}
          </div>
          {!loading && kilo.daysWithLog < 7 && (
            <div className="text-amber-800 mt-1">Some days have no Mix Log. If the calculated kilos look low, type the right number over them.</div>
          )}
          {unmapped.length > 0 && (
            <div className="text-amber-800 mt-1">
              No ingredient shares are set for {unmapped.map(([id, kg]) => `${dough(id)} (${kg.toFixed(0)} kg)`).join(', ')}, so those kilos add nothing to the calculation.
            </div>
          )}
        </div>

        <div className="card p-0 overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-bark-800/60 border-b border-wheat-400/30">
                <th className="p-3">Row on the Schripps sheet</th>
                <th className="p-3">How it's worked out</th>
                <th className="p-3 w-40">Column C</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const def = INGREDIENT_ROWS[i]
                return (
                  <tr key={r.key} className="border-b border-wheat-400/20">
                    <td className="p-3 font-medium text-bark-900">{r.label}</td>
                    <td className="p-3 text-bark-800/70">
                      {r.kind === 'count' && <>From the inventory book{def.book ? <> · "{def.book}" used amount</> : <> · not in the book, type it</>}</>}
                      {r.kind === 'kilo' && <>Calculated from the Mix Log{r.overridden && r.calculated !== undefined ? <> · typed over (calculated {r.calculated})</> : <> · {r.calculated}</>}</>}
                      {r.kind === 'split' && <>Seed Mix ÷ 4</>}
                      {r.kind === 'fixed' && <>Same every week unless you change it</>}
                    </td>
                    <td className="p-3">
                      {r.kind === 'count' && (
                        <input className={`input w-32 ${r.missing ? 'border-amber-500' : ''}`} type="number" min="0" step="any" placeholder="0"
                          value={show(input.counts[r.key])} onChange={e => setCount(r.key, e.target.value)} />
                      )}
                      {r.kind === 'fixed' && (
                        <input className="input w-32" type="number" min="0" step="any"
                          value={show(input.fixed[r.key] ?? def.fixedDefault)} onChange={e => setFixed(r.key, e.target.value)} />
                      )}
                      {r.kind === 'kilo' && (
                        <input className="input w-32" type="number" min="0" step="any" placeholder={String(r.calculated ?? 0)}
                          value={show(input.kiloOverrides[r.key])} onChange={e => setOverride(r.key, e.target.value)} />
                      )}
                      {r.kind === 'split' && <span className="font-mono">{r.value}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {missing > 0 && !loading && (
          <div className="text-sm text-amber-800 mb-3">{missing} counted row(s) have nothing typed yet and will copy as 0 (outlined in orange).</div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary flex items-center gap-2" onClick={save} disabled={!dirty}>
            <Save className="w-4 h-4" /> Save week
          </button>
          <button className="btn-secondary flex items-center gap-2" onClick={copyColumn}>
            <Copy className="w-4 h-4" /> Copy column C
          </button>
          <span className="text-xs text-bark-800/60">{dirty ? 'Unsaved changes' : savedInfo}</span>
        </div>
        <p className="text-xs text-bark-800/50 mt-3">
          The Copy button copies 36 numbers, one per line, in the order of the Schripps sheet. Paste them into the first cell of column C (the AP Flour row).
        </p>
      </div>
    </AppShell>
  )
}
