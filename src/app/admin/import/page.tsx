'use client'
import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService } from '@/lib/db'
import { Customer, CustomerType } from '@/types'
import { Upload, CheckCircle, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── CLIENT MASTER IMPORT ─────────────────────────────────────────────────────

function parseClientMasterCSV(text: string): Partial<Customer>[] {
  const lines = text.replace(/\uFEFF/g, '').split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  // Parse CSV respecting quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').replace(/[^\x20-\x7E]/g, '').trim())
  const col = (row: string[], name: string) => {
    const i = headers.findIndex(h => h.toLowerCase() === name.toLowerCase())
    return i >= 0 ? (row[i] || '').trim() : ''
  }

  const customers: Partial<Customer>[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i])
    const name = col(row, 'CLIENT') || col(row, 'Client Name') || col(row, 'Client')
    if (!name) continue
    const activeRaw = (col(row, 'ACTIVE?') || col(row, 'Active')).toUpperCase()
    const active = activeRaw !== 'N'
    const freshbooksClientId = col(row, 'Client ID')
    const email = col(row, 'AP Invoicing Email')
    const packaging = col(row, 'Packaging Type')

    // Determine CustomerType from packaging
    let type: CustomerType = 'Wholesale'
    if (packaging.toLowerCase().includes('retail')) type = 'Rustic Retail'
    else if (packaging.toLowerCase().includes('market')) type = 'Farmers Market'

    customers.push({
      name,
      type,
      route: col(row, 'Route'),
      distributor: col(row, 'Distributor'),
      packagingType: packaging,
      freshbooksClientId: freshbooksClientId || '',
      email: email !== 'N/A' ? email : '',
      address: col(row, 'Address'),
      notes: col(row, 'Delivery Notes'),
      code: '',
      callNumber: '',
      deliveryInfo: col(row, 'Route'),
      phone: '',
      active,
      pricing: {},
      slicing: {},
    })
  }
  return customers
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

type ImportRow = {
  name: string
  status: 'pending' | 'importing' | 'done' | 'error'
  error?: string
  customer: Partial<Customer>
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const customers = parseClientMasterCSV(text)
      if (!customers.length) {
        toast.error('No customers found — make sure this is the client master CSV')
        return
      }
      setRows(customers.map(c => ({
        name: c.name || '',
        status: 'pending',
        customer: c,
      })))
      setDone(false)
      toast.success(`Found ${customers.length} customers`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    if (!rows.length) return
    setImporting(true)
    for (let i = 0; i < rows.length; i++) {
      setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'importing' } : r))
      try {
        await customersService.create(rows[i].customer as Omit<Customer, 'id' | 'createdAt'>)
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done' } : r))
      } catch (err: any) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: err.message } : r))
      }
    }
    setImporting(false)
    setDone(true)
    toast.success('Import complete!')
  }

  async function handleDeleteAll() {
    setDeleting(true)
    try {
      const all = await customersService.getAll()
      await Promise.all(all.map(c => customersService.update(c.id, { active: false } as any)))
      // Actually delete them
      // customersService doesn't have delete, so we'll use a workaround via direct Firestore
      const { db } = await import('@/lib/firebase')
      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore')
      const snap = await getDocs(collection(db, 'customers'))
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'customers', d.id))))
      toast.success(`Deleted ${snap.docs.length} customers`)
      setDeleteConfirm(false)
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message)
    }
    setDeleting(false)
  }

  const doneCount = rows.filter(r => r.status === 'done').length
  const errorCount = rows.filter(r => r.status === 'error').length
  const activeCount = rows.filter(r => r.customer.active).length
  const inactiveCount = rows.filter(r => !r.customer.active).length

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-bark-900 mb-6">Import Customers</h1>

        {/* Delete All */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-red-800">Delete All Existing Customers</div>
              <div className="text-sm text-red-600">Permanently removes all customers from Firestore. Do this before importing fresh data.</div>
            </div>
            {!deleteConfirm ? (
              <button onClick={() => setDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                <Trash2 className="inline w-4 h-4 mr-1" />Delete All
              </button>
            ) : (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-red-700 font-medium">Are you sure?</span>
                <button onClick={handleDeleteAll} disabled={deleting}
                  className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-medium hover:bg-red-800 disabled:opacity-50">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete All'}
                </button>
                <button onClick={() => setDeleteConfirm(false)}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Upload */}
        <div className="bg-white border border-bark-200 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-bark-900 mb-1">Upload Client Master CSV</h2>
          <p className="text-sm text-bark-600 mb-4">
            Upload the <strong>client-master.csv</strong> file. Columns used: Client Name, AP Invoicing Email,
            Packaging Type, Distributor, Route, Active, Address, Delivery Notes.
          </p>
          <label className="flex items-center gap-2 px-4 py-2 bg-bark-700 text-white rounded-lg hover:bg-bark-800 cursor-pointer w-fit">
            <Upload className="w-4 h-4" />
            Choose CSV File
            <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </label>
        </div>

        {/* Preview & Import */}
        {rows.length > 0 && (
          <div className="bg-white border border-bark-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-bark-100 flex items-center justify-between">
              <div>
                <span className="font-semibold text-bark-900">{rows.length} customers loaded</span>
                <span className="text-sm text-bark-500 ml-3">
                  {activeCount} active · {inactiveCount} inactive
                </span>
                {done && (
                  <span className="ml-3 text-sm">
                    <span className="text-green-600">{doneCount} imported</span>
                    {errorCount > 0 && <span className="text-red-600 ml-2">{errorCount} errors</span>}
                  </span>
                )}
              </div>
              {!done && (
                <button onClick={handleImport} disabled={importing || done}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  Import {rows.length} Customers
                </button>
              )}
            </div>

            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="bg-bark-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-bark-600">Name</th>
                    <th className="text-left px-4 py-2 text-bark-600">Route</th>
                    <th className="text-left px-4 py-2 text-bark-600">Distributor</th>
                    <th className="text-left px-4 py-2 text-bark-600">Packaging</th>
                    <th className="text-left px-4 py-2 text-bark-600">Active</th>
                    <th className="text-left px-4 py-2 text-bark-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={`border-t border-bark-100 ${!row.customer.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2 font-medium">{row.name}</td>
                      <td className="px-4 py-2 text-bark-600">{row.customer.route || '—'}</td>
                      <td className="px-4 py-2 text-bark-600">{row.customer.distributor || '—'}</td>
                      <td className="px-4 py-2 text-bark-600">{row.customer.packagingType || '—'}</td>
                      <td className="px-4 py-2">
                        {row.customer.active
                          ? <span className="text-green-600 text-xs font-medium">Y</span>
                          : <span className="text-bark-400 text-xs">N</span>}
                      </td>
                      <td className="px-4 py-2">
                        {row.status === 'pending' && <span className="text-bark-400">Pending</span>}
                        {row.status === 'importing' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        {row.status === 'done' && <CheckCircle className="w-4 h-4 text-green-500" />}
                        {row.status === 'error' && (
                          <span className="text-red-500 text-xs">{row.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
