'use client'
import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService, ordersService } from '@/lib/db'
import { Customer, Order } from '@/types'
import { FileSpreadsheet, FileText, Download, Loader2, Calendar, Filter } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type ReportRow = {
  invoiceNumber: string
  date: string
  address: string
  name: string
  account: string   // distributor
  route: string
  amount: number
  notes: string
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function formatDateForFilename(iso: string) {
  return iso.replace(/-/g, '_')
}

// ─── AUTOROUTE XLSX GENERATOR ─────────────────────────────────────────────────
async function generateAutoRouteXLSX(rows: ReportRow[], date: string, filterAccount: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Newlight Breadworks OMS'

  const ws = wb.addWorksheet('AutoRoute')

  const headers = ['INVOICE #', 'DATE', 'SHIP-TO ADDRESS', 'NAME', 'ACCOUNT', 'ROUTE', ' AMOUNT ', 'HEADER NOTES']
  const headerRow = ws.addRow(headers)
  headerRow.height = 15
  headerRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Arial', bold: colNum < 8, size: 10, color: { argb: 'FF000000' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDBDBD' } }
    cell.alignment = { horizontal: colNum === 1 ? 'center' : 'left', vertical: 'middle' }
  })

  const acctFmt = '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)'

  const [y, m, d] = date.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)

  rows.forEach((r, i) => {
    const rowData = [
      i + 1,
      dateObj,
      r.address,
      r.name,
      'NL',
      r.route,
      r.amount,
      r.notes,
    ]
    const row = ws.addRow(rowData)
    row.height = 15

    const fillColor = i % 2 === 0 ? 'FFFFFFFF' : 'FFF3F3F3'
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum > 8) return
      cell.font = { name: 'Arial', size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    })

    row.getCell(1).alignment = { horizontal: 'center' }
    row.getCell(2).numFmt = 'm/d/yyyy'
    row.getCell(2).alignment = { horizontal: 'left' }
    row.getCell(7).numFmt = acctFmt
    row.getCell(7).alignment = { horizontal: 'right' }
  })

  ws.getColumn(1).width = 12.63
  ws.getColumn(2).width = 10.75
  ws.getColumn(3).width = 31.88
  ws.getColumn(4).width = 31.38
  ws.getColumn(5).width = 15.13
  ws.getColumn(6).width = 11.13
  ws.getColumn(7).width = 14.00
  ws.getColumn(8).width = 55.00

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  const ws2 = wb.addWorksheet('RouteRevenue')
  const routes = [...new Set(rows.map(r => r.route).filter(Boolean))].sort()

  const rh = ws2.addRow(['ROUTE', 'TOTAL'])
  rh.eachCell(cell => {
    cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FF000000' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDBDBD' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  const dataStart = 2
  const dataEnd = rows.length + 1

  routes.forEach((route, i) => {
    const rowNum = i + 2
    const row = ws2.addRow([
      route,
      { formula: `SUMIF(AutoRoute!F$${dataStart}:F$${dataEnd},A${rowNum},AutoRoute!G$${dataStart}:G$${dataEnd})` }
    ])
    row.getCell(1).font = { name: 'Arial', size: 10 }
    row.getCell(2).numFmt = acctFmt
    row.getCell(2).alignment = { horizontal: 'right' }
    const fillColor = i % 2 === 0 ? 'FFFFFFFF' : 'FFF3F3F3'
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    })
  })

  const gtRow = ws2.addRow(['GRAND TOTAL', { formula: `SUM(B2:B${routes.length + 1})` }])
  gtRow.eachCell(cell => {
    cell.font = { name: 'Arial', bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
  })
  gtRow.getCell(2).numFmt = acctFmt
  gtRow.getCell(2).alignment = { horizontal: 'right' }

  ws2.getColumn(1).width = 16
  ws2.getColumn(2).width = 16

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const accountLabel = filterAccount === 'ALL' ? 'ALL' : filterAccount.replace(/[^a-zA-Z0-9]/g, '')
  a.download = `ALLNP_AutoRoute_${formatDateForFilename(date)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── SIGN-OFF / MRS PDF GENERATOR ─────────────────────────────────────────────
async function generateSignOffPDF(rows: ReportRow[], date: string, reportType: 'signoff' | 'mrs') {
  const { jsPDF } = await import('jspdf')
  await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()

  const title = reportType === 'signoff' ? 'NEWLIGHT SIGN-OFF SHEET' : 'MRS ROUTE SHEET'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(title, pageW / 2, 40, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(date), pageW / 2, 56, { align: 'center' })

  if (reportType === 'signoff') {
    ;(doc as any).autoTable({
      startY: 70,
      head: [['CLIENT', 'VOLUME', 'ROUTE', 'CODE', 'LABEL COUNT COMPLETE', 'MISSING LABEL NUMBER(S)', 'DATE']],
      body: rows.map(r => [r.name, '', r.route, '', 'YES', 'NO', formatDate(date)]),
      headStyles: {
        fillColor: [68, 114, 196],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 160 },
        1: { cellWidth: 55, halign: 'center' },
        2: { cellWidth: 55, halign: 'center' },
        3: { cellWidth: 55, halign: 'center' },
        4: { cellWidth: 90, halign: 'center' },
        5: { cellWidth: 110, halign: 'center' },
        6: { cellWidth: 70, halign: 'center' },
      },
      alternateRowStyles: { fillColor: [242, 242, 242] },
      margin: { left: 36, right: 36 },
    })
  } else {
    ;(doc as any).autoTable({
      startY: 70,
      head: [['DATE', 'CLIENT', 'ROUTE']],
      body: rows.map(r => [formatDate(date), r.name, r.route]),
      headStyles: {
        fillColor: [68, 114, 196],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 90, halign: 'center' },
        1: { cellWidth: 250 },
        2: { cellWidth: 120 },
      },
      alternateRowStyles: { fillColor: [242, 242, 242] },
      margin: { left: 36, right: 36 },
    })
  }

  const typeLabel = reportType === 'signoff' ? 'SIGNOFF' : 'MRS'
  doc.save(`${typeLabel}_${formatDateForFilename(date)}.pdf`)
}

// ─── FEATHERSTONE ROUTE REPORT GENERATOR ──────────────────────────────────────
// Matches NLRoute template exactly. Only orders for distributor = "FS".
// Customer code is parsed out of the route field (e.g. "R41 NL-171" → "NL-171").

type FeatherstoneRow = {
  customerCode: string
  orderValue: number
}

function extractFeatherstoneCode(route: string): string {
  const match = (route || '').match(/NL-\d+/)
  return match ? match[0] : ''
}

async function generateFeatherstoneXLSX(orders: Order[], customers: Customer[], date: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Newlight Breadworks OMS'
  const ws = wb.addWorksheet('NLRoute')

  const fsRows: FeatherstoneRow[] = orders
    .map(order => {
      const customer = customers.find(c => c.id === order.customerId)
      if (customer?.distributor !== 'FS') return null
      const orderValue = order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      return { customerCode: extractFeatherstoneCode(customer.route || ''), orderValue }
    })
    .filter((r): r is FeatherstoneRow => r !== null)

  const headers = ['TranDate', 'OrderStatus', 'CustomerExternalID', 'itemline_item', 'itemline_units', 'itemline_quantity', 'Service Delivery', 'Customer Channel', 'ExternalID', 'OrderValue', 'Total']
  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FF000000' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDBDBD' } }
  })

  const [y, m, d] = date.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const mmddyy = `${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}${String(y).slice(-2)}`

  fsRows.forEach((r, i) => {
    const externalId = `${mmddyy}NL-${i + 1}`
    const row = ws.addRow([
      dateObj,
      'Pending Fulfillment',
      r.customerCode,
      3253,
      'ea',
      1,
      'yes',
      'Service',
      externalId,
      r.orderValue,
      r.orderValue,
    ])
    row.getCell(1).numFmt = 'm/d/yyyy'
    const fillColor = i % 2 === 0 ? 'FFFFFFFF' : 'FFF3F3F3'
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: 'Arial', size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } }
    })
  })

  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 16
  ws.getColumn(9).width = 16
  ws.getColumn(10).width = 12
  ws.getColumn(11).width = 12
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `NLRoute_${formatDateForFilename(date)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)

  return fsRows.length
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [filterAccount, setFilterAccount] = useState('ALL')
  const [filterRoute, setFilterRoute] = useState('ALL')
  const [generating, setGenerating] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [allCustomers, dayOrders] = await Promise.all([
        customersService.getAll(),
        ordersService.getByDate(date),
      ])
      setCustomers(allCustomers)
      setOrders(dayOrders.filter(o => o.status !== 'cancelled'))
      setLoaded(true)
      toast.success(`Loaded ${dayOrders.length} orders for ${formatDate(date)}`)
    } catch (err: any) {
      toast.error('Failed to load orders: ' + err.message)
    }
    setLoading(false)
  }

  function buildRows(): ReportRow[] {
    return orders.map(order => {
      const customer = customers.find(c => c.id === order.customerId)
      return {
        invoiceNumber: (order as any).freshbooksInvoiceNumber || '',
        date,
        address: customer?.address || '',
        name: order.customerName,
        account: customer?.distributor || '',
        route: customer?.route || '',
        amount: order.totalAmount || 0,
        notes: customer?.notes || '',
      }
    })
  }

  function filteredRows(): ReportRow[] {
    let rows = buildRows()
    if (filterAccount !== 'ALL') {
      const selected = filterAccount.split(',')
      rows = rows.filter(r => selected.includes(r.account))
    }
    if (filterRoute !== 'ALL') rows = rows.filter(r => r.route === filterRoute)
    return rows.sort((a, b) => a.route.localeCompare(b.route) || a.name.localeCompare(b.name))
  }

  const allRows = buildRows()
  const uniqueAccounts = ['ALL', ...new Set(allRows.map(r => r.account).filter(Boolean))].sort()
  const uniqueRoutes = ['ALL', ...new Set(allRows.map(r => r.route).filter(Boolean))].sort()

  async function handleGenerate(type: 'xlsx' | 'signoff' | 'mrs' | 'featherstone') {
    if (type === 'featherstone') {
      setGenerating(type)
      try {
        const count = await generateFeatherstoneXLSX(orders, customers, date)
        if (!count) { toast.error('No Featherstone (FS) orders for this date') }
        else toast.success(`Featherstone route report downloaded (${count} rows)`)
      } catch (err: any) {
        toast.error('Generation failed: ' + err.message)
        console.error(err)
      }
      setGenerating(null)
      return
    }
    const rows = filteredRows()
    if (!rows.length) { toast.error('No orders match the current filters'); return }
    setGenerating(type)
    try {
      if (type === 'xlsx') {
        await generateAutoRouteXLSX(rows, date, filterAccount)
        toast.success(`AutoRoute XLSX downloaded (${rows.length} rows)`)
      } else {
        await generateSignOffPDF(rows, date, type)
        toast.success(`${type === 'signoff' ? 'Sign-Off Sheet' : 'MRS Route Sheet'} PDF downloaded`)
      }
    } catch (err: any) {
      toast.error('Generation failed: ' + err.message)
      console.error(err)
    }
    setGenerating(null)
  }

  const rows = loaded ? filteredRows() : []

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-bark-900 mb-1">Reports</h1>
        <p className="text-bark-500 text-sm mb-6">Generate AutoRoute spreadsheets and sign-off PDFs by date and distributor.</p>

        <div className="bg-white border border-bark-200 rounded-xl p-5 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-bark-600 mb-1">
                <Calendar className="inline w-3 h-3 mr-1" />Delivery Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => { setDate(e.target.value); setLoaded(false) }}
                className="border border-bark-300 rounded-lg px-3 py-2 text-sm text-bark-900 focus:outline-none focus:ring-2 focus:ring-wheat-400"
              />
            </div>

            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-bark-800 text-white rounded-lg text-sm font-medium hover:bg-bark-900 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Load Orders
            </button>

            {loaded && (
              <>
                <div>
                  <label className="block text-xs font-medium text-bark-600 mb-2">
                    <Filter className="inline w-3 h-3 mr-1" />Distributor (Account)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {uniqueAccounts.filter(a => a !== 'ALL').map(a => (
                      <label key={a} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterAccount === 'ALL' || filterAccount.split(',').includes(a)}
                          onChange={e => {
                            const current = filterAccount === 'ALL' ? uniqueAccounts.filter(x => x !== 'ALL') : filterAccount.split(',')
                            const next = e.target.checked ? [...current, a] : current.filter(x => x !== a)
                            setFilterAccount(next.length === 0 || next.length === uniqueAccounts.filter(x => x !== 'ALL').length ? 'ALL' : next.join(','))
                          }}
                          className="accent-wheat-500"
                        />
                        <span className="text-sm text-bark-900">{a}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-bark-600 mb-1">Route</label>
                  <select
                    value={filterRoute}
                    onChange={e => setFilterRoute(e.target.value)}
                    className="border border-bark-300 rounded-lg px-3 py-2 text-sm text-bark-900 focus:outline-none focus:ring-2 focus:ring-wheat-400"
                  >
                    {uniqueRoutes.map(r => (
                      <option key={r} value={r}>{r === 'ALL' ? 'All Routes' : r}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {loaded && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-bark-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <div className="font-semibold text-bark-900 text-sm">AutoRoute XLSX</div>
                  <div className="text-xs text-bark-500">AutoRoute + RouteRevenue sheets</div>
                </div>
              </div>
              <div className="text-xs text-bark-500 mb-4">
                {rows.length} orders · {filterAccount !== 'ALL' ? filterAccount : 'All distributors'}
                {filterRoute !== 'ALL' ? ` · Route ${filterRoute}` : ''}
              </div>
              <button
                onClick={() => handleGenerate('xlsx')}
                disabled={!!generating || !rows.length}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {generating === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download XLSX
              </button>
            </div>

            <div className="bg-white border border-bark-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <div className="font-semibold text-bark-900 text-sm">Sign-Off Sheet</div>
                  <div className="text-xs text-bark-500">Newlight sign-off PDF</div>
                </div>
              </div>
              <div className="text-xs text-bark-500 mb-4">
                {rows.length} orders · Client, Route, Code, Label columns
              </div>
              <button
                onClick={() => handleGenerate('signoff')}
                disabled={!!generating || !rows.length}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {generating === 'signoff' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </button>
            </div>

            <div className="bg-white border border-bark-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-700" />
                </div>
                <div>
                  <div className="font-semibold text-bark-900 text-sm">MRS Route Sheet</div>
                  <div className="text-xs text-bark-500">Date, client name, route PDF</div>
                </div>
              </div>
              <div className="text-xs text-bark-500 mb-4">
                {rows.length} orders · Date, Client, Route columns
              </div>
              <button
                onClick={() => handleGenerate('mrs')}
                disabled={!!generating || !rows.length}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
              >
                {generating === 'mrs' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </button>
            </div>

            <div className="bg-white border border-bark-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-orange-700" />
                </div>
                <div>
                  <div className="font-semibold text-bark-900 text-sm">Featherstone Route</div>
                  <div className="text-xs text-bark-500">NLRoute XLSX for FS orders</div>
                </div>
              </div>
              <div className="text-xs text-bark-500 mb-4">
                {orders.filter(o => customers.find(c => c.id === o.customerId)?.distributor === 'FS').length} FS orders for this date
              </div>
              <button
                onClick={() => handleGenerate('featherstone')}
                disabled={!!generating}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
              >
                {generating === 'featherstone' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download XLSX
              </button>
            </div>
          </div>
        )}

        {loaded && rows.length > 0 && (
          <div className="bg-white border border-bark-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-bark-100">
              <span className="font-semibold text-bark-900 text-sm">Preview — {rows.length} orders</span>
            </div>
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="bg-bark-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-bark-600 text-xs">#</th>
                    <th className="text-left px-4 py-2 text-bark-600 text-xs">CLIENT</th>
                    <th className="text-left px-4 py-2 text-bark-600 text-xs">ACCOUNT</th>
                    <th className="text-left px-4 py-2 text-bark-600 text-xs">ROUTE</th>
                    <th className="text-left px-4 py-2 text-bark-600 text-xs">INVOICE #</th>
                    <th className="text-right px-4 py-2 text-bark-600 text-xs">AMOUNT</th>
                    <th className="text-left px-4 py-2 text-bark-600 text-xs">ADDRESS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-t border-bark-100 hover:bg-bark-50">
                      <td className="px-4 py-2 text-bark-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-bark-900">{row.name}</td>
                      <td className="px-4 py-2 text-bark-600">{row.account || <span className="text-red-400 text-xs">No distributor</span>}</td>
                      <td className="px-4 py-2 text-bark-600">{row.route || <span className="text-red-400 text-xs">No route</span>}</td>
                      <td className="px-4 py-2 text-bark-500 text-xs font-mono">{row.invoiceNumber || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">${row.amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-bark-500 text-xs truncate max-w-[200px]">{row.address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-bark-50 border-t-2 border-bark-200">
                  <tr>
                    <td colSpan={5} className="px-4 py-2 font-semibold text-bark-700 text-sm text-right">TOTAL</td>
                    <td className="px-4 py-2 font-bold text-bark-900 text-right font-mono">
                      ${rows.reduce((s, r) => s + r.amount, 0).toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {loaded && rows.length === 0 && (
          <div className="bg-bark-50 border border-bark-200 rounded-xl p-12 text-center">
            <p className="text-bark-500">No orders found for the selected filters.</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}  
