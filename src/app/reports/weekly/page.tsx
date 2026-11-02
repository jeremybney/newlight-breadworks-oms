'use client'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService, ordersService } from '@/lib/db'
import type { Customer, Order } from '@/types'
import { addDays, format, getDay, parseISO } from 'date-fns'
import { Copy, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

// Route order used on the weekly route revenue sheet. Any route not listed goes after these, A to Z.
const ROUTE_ORDER = ['B1', 'B2', 'BU2', 'B5', 'B6', 'B9', 'CT', 'CTS', 'LI', 'LIH', 'MID', 'ND1', 'NJT', 'NU1', 'SB4', 'ZAB']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const NO_ROUTE = '(no route)'

function mondayOf(iso: string): string {
  const d = parseISO(iso)
  const dow = getDay(d) // 0 Sun .. 6 Sat
  return format(addDays(d, dow === 0 ? -6 : 1 - dow), 'yyyy-MM-dd')
}

// Same amount the daily AutoRoute export uses (the order total), with a fallback to the item sum.
function orderAmount(o: Order): number {
  if (o.totalAmount && o.totalAmount > 0) return o.totalAmount
  return (o.items || []).reduce((s, i) => s + i.quantity * (i.unitPrice || 0), 0)
}

const fmt = (n: number) => (n === 0 ? '–' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

export default function WeeklyRouteRevenuePage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(format(new Date(), 'yyyy-MM-dd')))
  const [account, setAccount] = useState('ALLNP')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [ordersByDay, setOrdersByDay] = useState<Order[][]>([])
  const [loading, setLoading] = useState(false)

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd')),
    [weekStart],
  )

  useEffect(() => { customersService.getAll().then(setCustomers).catch(() => toast.error('Could not load customers')) }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(days.map(d => ordersService.getByDate(d)))
      .then(lists => { if (!cancelled) setOrdersByDay(lists.map(l => l.filter(o => o.status !== 'cancelled'))) })
      .catch(() => toast.error('Could not load orders'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [days])

  const accounts = useMemo(
    () => Array.from(new Set(customers.map(c => (c.distributor || '').trim()).filter(Boolean))).sort(),
    [customers],
  )

  const { routes, matrix } = useMemo(() => {
    const byId = new Map(customers.map(c => [c.id, c]))
    const isAcct = (c: Customer | undefined) => !!c && (c.distributor || '').trim() === account
    const routeSet = new Set<string>()
    // Every route of the account appears, even with no orders that week.
    customers.filter(c => c.active !== false && isAcct(c)).forEach(c => routeSet.add((c.route || '').trim() || NO_ROUTE))
    const m: Record<string, number[]> = {}
    ordersByDay.forEach((orders, di) => {
      orders.forEach(o => {
        const c = byId.get(o.customerId)
        if (!isAcct(c)) return
        const r = (c!.route || '').trim() || NO_ROUTE
        routeSet.add(r)
        if (!m[r]) m[r] = [0, 0, 0, 0, 0, 0, 0]
        m[r][di] += orderAmount(o)
      })
    })
    const list = Array.from(routeSet).filter(r => r !== NO_ROUTE || m[NO_ROUTE])
    list.sort((a, b) => {
      const ia = ROUTE_ORDER.indexOf(a), ib = ROUTE_ORDER.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b)
    })
    list.forEach(r => { if (!m[r]) m[r] = [0, 0, 0, 0, 0, 0, 0] })
    return { routes: list, matrix: m }
  }, [customers, ordersByDay, account])

  const dayTotals = days.map((_, i) => routes.reduce((s, r) => s + matrix[r][i], 0))
  const weekTotal = dayTotals.reduce((s, n) => s + n, 0)

  function copy(withRoute: boolean) {
    const lines = routes.map(r => {
      const vals = matrix[r].map(n => n.toFixed(2))
      return (withRoute ? [r, ...vals] : vals).join('\t')
    })
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success(withRoute ? 'Copied route names + Monday to Sunday' : 'Copied Monday to Sunday amounts'),
      () => toast.error('Could not copy'),
    )
  }

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-bark-900 mb-1">Weekly Route Revenue</h1>
        <p className="text-bark-500 text-sm mb-5">
          Delivery amount by route and day for one distributor. Cancelled orders are left out. Uses the same order total as the daily AutoRoute export.
        </p>

        <div className="flex flex-wrap gap-4 items-end mb-5">
          <div>
            <label className="block text-xs font-medium text-bark-600 mb-1">Week (any day; snaps to Monday)</label>
            <input
              type="date" value={weekStart}
              onChange={e => e.target.value && setWeekStart(mondayOf(e.target.value))}
              className="border border-bark-300 rounded-lg px-3 py-2 text-sm text-bark-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-bark-600 mb-1">Distributor</label>
            <select value={account} onChange={e => setAccount(e.target.value)} className="border border-bark-300 rounded-lg px-3 py-2 text-sm text-bark-900">
              {!accounts.includes('ALLNP') && <option value="ALLNP">ALLNP</option>}
              {accounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button onClick={() => copy(true)} className="flex items-center gap-2 px-4 py-2 bg-bark-800 text-white rounded-lg text-sm font-medium hover:bg-bark-900">
            <Copy className="w-4 h-4" /> Copy route + Mon–Sun
          </button>
          <button onClick={() => copy(false)} className="flex items-center gap-2 px-4 py-2 border border-bark-300 rounded-lg text-sm font-medium text-bark-900 hover:bg-cream-100">
            <Copy className="w-4 h-4" /> Copy Mon–Sun only
          </button>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-bark-500" />}
        </div>

        <div className="bg-white border border-bark-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bark-800 text-cream-50">
                <th className="text-left px-3 py-2">Route</th>
                {days.map((d, i) => (
                  <th key={d} className="text-right px-3 py-2 whitespace-nowrap">
                    {DAY_NAMES[i]}<div className="text-xs font-normal opacity-70">{format(parseISO(d), 'M/d')}</div>
                  </th>
                ))}
                <th className="text-right px-3 py-2 bg-wheat-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r, ri) => {
                const rowTotal = matrix[r].reduce((s, n) => s + n, 0)
                return (
                  <tr key={r} className={ri % 2 ? 'bg-cream-50' : ''}>
                    <td className="px-3 py-1.5 font-medium">{r}</td>
                    {matrix[r].map((n, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{fmt(n)}</td>)}
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums bg-wheat-100">{fmt(rowTotal)}</td>
                  </tr>
                )
              })}
              <tr className="font-bold border-t-2 border-bark-800">
                <td className="px-3 py-2">Weekly total</td>
                {dayTotals.map((n, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{fmt(n)}</td>)}
                <td className="px-3 py-2 text-right tabular-nums bg-wheat-100">{fmt(weekTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-bark-500 mt-3">
          Paste "route + Mon–Sun" into the Route column of your weekly sheet (it leaves your NL Revenue formula alone), or "Mon–Sun only" into the Monday column.
        </p>
      </div>
    </AppShell>
  )
}
