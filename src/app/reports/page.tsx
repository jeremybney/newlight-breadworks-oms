'use client'
import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService, ordersService } from '@/lib/db'
import { Customer, Order } from '@/types'
import { FileSpreadsheet, FileText, Download, Loader2, Calendar, Filter } from 'lucide-react'
import toast from 'react-hot-toast'

type ReportRow = {
  invoiceNumber: string
  date: string
  address: string
  name: string
  account: string
  route: string
  amount: number
  notes: string
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function formatDateForFilename(iso: string) {
  return iso.replace(/-/g, '_')
}

async function generateAutoRouteXLSX(rows: ReportRow[], date: string, filterAccount: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('AutoRoute')

  const headers = ['INVOICE #', 'DATE', 'SHIP-TO ADDRESS', 'NAME', 'ACCOUNT', 'ROUTE', 'AMOUNT', 'HEADER NOTES']
  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })
  headerRow.height = 18

  rows.forEach((r, i) => {
    const row = ws.addRow([i + 1, formatDate(date), r.address, r.name, r.account, r.route, r.amount, r.notes])
    row.getCell(1).alignment = { horizontal: 'center' }
    row.getCell(2).alignment = { horizontal: 'center' }
    row.getCell(7).numFmt = '$#,##0.00'
    row.getCell(7).alignment = { horizontal: 'right' }
    if (i % 2 === 1) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } })
    }
    row.eachCell(cell => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })
  })

  const totalRow = ws.addRow(['', '', '', '', '', 'TOTAL', { formula: `SUM(G2:G${rows.length + 1})` }, ''])
  totalRow.getCell(6).font = { bold: true }
  totalRow.getCell(7).font = { bold: true }
  totalRow.getCell(7).numFmt = '$#,##0.00'
  totalRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }

  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 13
  ws.getColumn(3).width = 38
  ws.getColumn(4).width = 30
  ws.getColumn(5).width = 12
  ws.getColumn(6).width = 10
  ws.getColumn(7).width = 12
  ws.getColumn(8).width = 55

  const ws2 = wb.addWorksheet('RouteRevenue')
  const routes = [...new Set(rows.map(r => r.route))].sort()
  const rh = ws2.addRow(['ROUTE', 'TOTAL'])
  rh.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
    cell.alignment = { horizontal: 'center' }
  })

  const dataStart = 2
  const dataEnd = rows.length + 1
  routes.forEach((route, i) => {
    const rowNum = i + 2
    const row = ws2.addRow([route, { formula: `SUMIF(AutoRoute!F$${dataStart}:F$${dataEnd},A${rowNum},AutoRoute!G$${dataStart}:G$${dataEnd})` }])
    row.getCell(2).numFmt = '$#,##0.00'
    if (i % 2 === 1) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } })
    }
  })

  const gtRow = ws2.addRow(['GRAND TOTAL', { formula: `SUM(B2:B${routes.length + 1})` }])
  gtRow.eachCell(cell => { cell.font = { bold: true } })
  gtRow.getCell(2).numFmt = '$#,##0.00'
  gtRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
  ws2.getColumn(1).width = 14
  ws2.getColumn(2).width = 14

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const accountLabel = filterAccount === 'ALL' ? 'ALL' : filterAccount.replace(/[^a-zA-Z0-9]/g, '')
  a.download = `${accountLabel}_AutoRoute_${formatDateForFilename(date)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

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
      headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 8 },
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
      headStyles: { fillColor: [68, 114, 196], textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 9 },
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

const btnBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  padding: '8px 16px', borderRadius: '8px', fontSize: '14px',
  fontWeight: 500, border: 'none', cursor: 'pointer', color: '#ffffff',
}
const btnDark: React.CSSProperties   = { ...btnBase, backgroundColor: '#4a3728' }
const btnGreen: React.CSSProperties  = { ...btnBase, backgroundColor: '#16a34a', width: '100%', justifyContent: 'center' }
const btnBlue: React.CSSProperties   = { ...btnBase, backgroundColor: '#2563eb', width: '100%', justifyContent: 'center' }
const btnPurple: React.CSSProperties = { ...btnBase, backgroundColor: '#7c3aed', width: '100%', justifyContent: 'center' }

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
      setOrders(dayOrders)
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
        notes: customer?.notes || order.notes || '',
      }
    })
  }

  function filteredRows(): ReportRow[] {
    let rows = buildRows()
    if (filterAccount !== 'ALL') rows = rows.filter(r => r.account === filterAccount)
    if (filterRoute !== 'ALL') rows = rows.filter(r => r.route === filterRoute)
    return rows.sort((a, b) => a.route.localeCompare(b.route) || a.name.localeCompare(b.name))
  }

  const allRows = buildRows()
  const uniqueAccounts = ['ALL', ...new Set(allRows.map(r => r.account).filter(Boolean))].sort()
  const uniqueRoutes = ['ALL', ...new Set(allRows.map(r => r.route).filter(Boolean))].sort()

  async function handleGenerate(type: 'xlsx' | 'signoff' | 'mrs') {
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
        <p className="text-sm mb-6" style={{ color: '#6b5744' }}>
          Generate AutoRoute spreadsheets and sign-off PDFs by date and distributor.
        </p>

        <div className="bg-white border border-bark-200 rounded-xl p-5 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#6b5744' }}>
                <Calendar className="inline w-3 h-3 mr-1" />Delivery Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => { setDate(e.target.value); setLoaded(false) }}
                className="border rounded-lg px-3 py-2 text-sm"
                style={{ borderColor: '#c4a882', color: '#2c1a0e' }}
              />
            </div>

            <button
              onClick={loadData}
              disabled={loading}
              style={{ ...btnDark, opacity: loading ? 0.5 : 1 }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Load Orders
            </button>

            {loaded && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#6b5744' }}>
                    <Filter className="inline w-3 h-3 mr-1" />Distributor
                  </label>
                  <select
                    value={filterAccount}
                    onChange={e => setFilterAccount(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: '#c4a882', color: '#2c1a0e' }}
                  >
                    {uniqueAccounts.map(a => (
                      <option key={a} value={a}>{a === 'ALL' ? 'All Distributors' : a}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#6b5744' }}>Route</label>
                  <select
                    value={filterRoute}
                    onChange={e => setFilterRoute(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: '#c4a882', color: '#2c1a0e' }}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-bark-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#dcfce7' }}>
                  <FileSpreadsheet className="w-5 h-5" style={{ color: '#15803d' }} />
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: '#2c1a0e' }}>AutoRoute XLSX</div>
                  <div className="text-xs" style={{ color: '#6b5744' }}>AutoRoute + RouteRevenue sheets</div>
                </div>
              </div>
              <div className="text-xs mb-4" style={{ color: '#6b5744' }}>
                {rows.length} orders · {filterAccount !== 'ALL' ? filterAccount : 'All distributors'}
                {filterRoute !== 'ALL' ? ` · Route ${filterRoute}` : ''}
              </div>
              <button
                onClick={() => handleGenerate('xlsx')}
                disabled={!!generating || !rows.length}
                style={{ ...btnGreen, opacity: (!!generating || !rows.length) ? 0.5 : 1 }}
              >
                {generating === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download XLSX
              </button>
            </div>

            <div className="bg-white border border-bark-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#dbeafe' }}>
                  <FileText className="w-5 h-5" style={{ color: '#1d4ed8' }} />
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: '#2c1a0e' }}>Sign-Off Sheet</div>
                  <div className="text-xs" style={{ color: '#6b5744' }}>Newlight sign-off PDF</div>
                </div>
              </div>
              <div className="text-xs mb-4" style={{ color: '#6b5744' }}>
                {rows.length} orders · Client, Route, Code, Label columns
              </div>
              <button
                onClick={() => handleGenerate('signoff')}
                disabled={!!generating || !rows.length}
                style={{ ...btnBlue, opacity: (!!generating || !rows.length) ? 0.5 : 1 }}
              >
                {generating === 'signoff' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </button>
            </div>

            <div className="bg-white border border-bark-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#ede9fe' }}>
                  <FileText className="w-5 h-5" style={{ color: '#6d28d9' }} />
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: '#2c1a0e' }}>MRS Route Sheet</div>
                  <div className="text-xs" style={{ color: '#6b5744' }}>Date, client name, route PDF</div>
                </div>
              </div>
              <div className="text-xs mb-4" style={{ color: '#6b5744' }}>
                {rows.length} orders · Date, Client, Route columns
              </div>
              <button
                onClick={() => handleGenerate('mrs')}
                disabled={!!generating || !rows.length}
                style={{ ...btnPurple, opacity: (!!generating || !rows.length) ? 0.5 : 1 }}
              >
                {generating === 'mrs' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </button>
            </div>
          </div>
        )}

        {loaded && rows.length > 0 && (
          <div className="bg-white border border-bark-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-bark-100">
              <span className="font-semibold text-sm" style={{ color: '#2c1a0e' }}>Preview — {rows.length} orders</span>
            </div>
            <div className="overflow-auto" style={{ maxHeight: '500px' }}>
              <table className="w-full text-sm">
                <thead className="bg-bark-50 sticky top-0">
                  <tr>
                    {['#', 'CLIENT', 'ACCOUNT', 'ROUTE', 'INVOICE #', 'AMOUNT', 'ADDRESS'].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-xs" style={{ color: '#6b5744' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-t border-bark-100 hover:bg-bark-50">
                      <td className="px-4 py-2 text-xs" style={{ color: '#9d7d5e' }}>{i + 1}</td>
                      <td className="px-4 py-2 font-medium" style={{ color: '#2c1a0e' }}>{row.name}</td>
                      <td className="px-4 py-2" style={{ color: '#6b5744' }}>
                        {row.account || <span style={{ color: '#ef4444', fontSize: '12px' }}>No distributor</span>}
                      </td>
                      <td className="px-4 py-2" style={{ color: '#6b5744' }}>
                        {row.route || <span style={{ color: '#ef4444', fontSize: '12px' }}>No route</span>}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs" style={{ color: '#9d7d5e' }}>{row.invoiceNumber || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">${row.amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-xs truncate" style={{ maxWidth: '200px', color: '#9d7d5e' }}>{row.address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ backgroundColor: '#faf8f4', borderTop: '2px solid #c4a882' }}>
                  <tr>
                    <td colSpan={5} className="px-4 py-2 font-semibold text-sm text-right" style={{ color: '#4a3728' }}>TOTAL</td>
                    <td className="px-4 py-2 font-bold text-right font-mono" style={{ color: '#2c1a0e' }}>
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
            <p style={{ color: '#6b5744' }}>No orders found for the selected filters.</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
