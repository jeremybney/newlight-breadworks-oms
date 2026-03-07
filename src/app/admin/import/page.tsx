'use client'
import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService } from '@/lib/db'
import { Customer, CustomerType } from '@/types'
import { Upload, CheckCircle, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── CSV COLUMN → PRODUCT ID MAPPING ─────────────────────────────────────────
const CSV_PRODUCT_MAP: Record<string, string> = {
  'Deli Rye (Retail)':                  'rye-retail',
  'Deli Rye (Large)':                   'rye-large',
  'Deli Rye Dinner Rol':                'rye-dinner-roll',
  'Mini Deli Rye Roll':                 'mini-deli-rye-roll',
  'Rye Hoagie':                         'rye-hoagie',
  'Multigrain (Large)':                 'mg-large',
  'Multigrain (Retail)':                'mg-retail',
  'Multigrain Boule':                   'mg-boule',
  'Multigrain Batard':                  'mg-batard',
  '17" Multigrain Baguette':            'mg-baguette',
  'Multigrain Hoagie':                  'mg-hoagie',
  'Multigrain Burger Bun':              'mg-burger-bun',
  'Multigrain Dinner Roll':             'mg-dinner-roll',
  'Mini Multigrain Roll':               'mg-mini-roll',
  'Whole Wheat Hoagie':                 'whole-wheat-hoagie',
  '5" Milk Burger Buns':                'mb-5in-burger-bun',
  '5" Milk Burger Buns (Seeded)':       'mb-5in-burger-seeded',
  '4" Milk Burger Bun':                 'mb-4in-burger-bun',
  '2.5" Milk Bread Slider (Seeded)':    'mb-bread-slider-seeded',
  '2.5" Milk Bread Slider':             'mb-bread-slider',
  'Milk Bread (Large)':                 'mb-large',
  'Milk Bread (Retail)':                'mb-retail',
  'Milk Bread (Large) (TH Sliced)':     'mb-large-fit-sliced',
  'Milk Bread (Large) (Sliced)':        'mb-large-sliced',
  'Mini Milk Bread Roll':               'mb-mini-loaf-roll',
  'Milk Bread Slider':                  'mb-bread-slider',
  'Brioche (Retail)':                   'brioche-pullman-retail',
  'Brioche (Large)':                    'brioche-pullman-large',
  'Hamburger Bun (Seeded)':             'bun-sesame-seeded',
  'Hamburger Bun (Everything)':         'bun-everything',
  'Hamburger Bun':                      'bun-plain',
  'Large Hamburger Bun':                'bun-large-hamburger',
  'Large Hamburger Bun (Seeded)':       'bun-large-seeded',
  'Parker House Roll':                  'parker-house-roll',
  'Parker House (Seeded)':              'parker-house-roll-oeuf',
  'Mini Parker House Roll':             'parker-house-roll',
  'Hot Dog Bun':                        'hotdog-bun',
  '8" Hot Dog Bun':                     'hotdog-bun-8in',
  '***8" Hot Dog Bun (Seeded)':         'hotdog-bun-8in',
  'Mini Hot Dog Bun':                   'hotdog-bun-mini',
  '3" Hot Dog Bun':                     'mini-hotdog-bun',
  'Italian Baguette':                   'italian-baguette',
  'Demi Italian Baguette':              'demi-italian-baguette',
  '24" Italian Baguette':               'italian-baguette-24in',
  '24" Italian Baguette (Deck)':        'italian-baguette-24in',
  'Ciabatta (Large)':                   'ciabatta-large',
  'Ciabatta (Small)':                   'ciabatta-small',
  '6" Ciabatta':                        'ciabatta-6in',
  '9" Ciabatta':                        'ciabatta-large',
  'Medium Ciabatta':                    'ciabatta-medium',
  'Ciabatta':                           'ciabatta-large',
  'Italian Hoagie 9"':                  'italian-hoagie-p',
  'Italian Hoagie (170g)':              'italian-hoagie-s',
  'Italian Slider 3"':                  'italian-slider',
  'Italian Dinner Roll':                'italian-dinner-roll',
  'Italian Burger Bun (100g)':          'italian-burger-bun-reg',
  'Italian Burger Bun':                 'italian-burger-bun',
  'Italian Batard':                     'italian-batard',
  'Large Batard (TH Sliced)':           'large-batard-sliced',
  '24" Sourdough Baguette':             'sd-baguette-24in',
  'Sourdough Focaccia (Wholesale)':     'sd-focaccia-wholesale',
  'Sourdough Focaccia (Retail)':        'sd-focaccia-retail',
  'Sourdough Focaccia (Half Sheet)':    'sd-focaccia-half',
  'Sourdough Baguette':                 'sd-baguette',
  'Demi Sourdough Baguette':            'demi-sd-baguette',
  'Sourdough Pullman (Large)':          'sd-pullman-large',
  'Sourdough Burger Bun':               'sd-burger-bun',
  'Mini Sourdough Roll':                'mini-sd-roll',
  'Dinner Roll':                        'sd-dinner-roll',
  '4" Boule':                           'boule-4in',
  '5" Boule':                           'boule-8in',
  'Large Sourdough Boule (Original)':   'sd-boule-large-orig',
  'Large Sourdough Boule (Seeded)':     'sd-boule-large-seeded',
  'Sourdough Batard':                   'sd-batard',
  'Sourdough Batard (Seeded)':          'sd-batard-seeded',
  'Large Batard':                       'large-batard',
  'Semolina':                           'semolina',
  'Semolina Hoagie':                    'semolina-hoagie',
  '24" Semolina Baguette':              'semolina-baguette-24in',
  'Semolina Burger Bun':                'semolina-burger-bun',
  'Mini Semolina Roll (Seeded)':        'mini-semolina-roll',
  'Semolina Hoagie (Large)':            'semolina-hoagie-lg',
  'Semolina Mini Baguette':             'semolina-mini-baguette',
  'Large Pretzel Loop (Salted)':        'pretzel-loop-lg-sliced',
  'Large Pretzel Loop (Unsalted)':      'pretzel-loop-lg-soft',
  'Jumbo Pretzel Loop (Salted)':        'jumbo-pretzel-sliced',
  'Pretzel Hero 7" (No Salt)':          'pretzel-hero-nosalt',
  'Pretzel Burger Bun':                 'pretzel-burger-bun',
  'Pretzel Parker House Roll':          'pretzel-parker-house',
  'Challah Rolls':                      'challah-roll',
  'Challah Parker House Rolls':         'challah-parker-house',
  'Challah Burger Bun':                 'challah-burger-bun',
  'White Bread (Large)':                'white-bread-large',
  'Sicilian':                           'sicilian',
  'Whole Wheat Sandwich':               'ww-sandwich',
  'Croissant':                          'croissant',
  'Plain Croissant':                    'plain-croissant',
  'Chocolate Croissant':                'chocolate-croissant',
  'Semolina Twist':                     'semolina-twist',
  'Light Rye Sandwich':                 'light-rye-sandwich',
  'White Sandwich':                     'white-sandwich',
  '4" Kaiser Roll':                     'kaiser-roll',
  'Kaiser Roll Slider':                 'kaiser-roll-slider',
  'Mini Multigrain Boule':              'mg-boule',
  'Ficelle':                            'sd-baguette',
}

// Columns that are NOT products (metadata + junk)
const NON_PRODUCT_COLS = new Set([
  'client', 'client url', 'client id', 'group', 'ap invoicing email',
  'additional ap contact', 'chef email', 'packaging type', 'distributor',
  'route', 'active', 'address', 'delivery notes', 'active?',
  'is this a recurring delivery?', 'fuel surcharge', 'delivery date',
  'email', 'delivery instructions', 'form host', 'reference id', 'ip',
  'recurring delivery end date', 'column 1', 'column 2', 'column 3',
  'column 4', 'column 5', 'column 6', 'column 7', 'column 8', 'column 9',
  'column 10', 'column 11', 'pumpernickle sandwich', "3' hoagie",
])

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
    const email = col(row, 'AP Invoicing Email')
    const packaging = col(row, 'Packaging Type')
    const freshbooksClientId = col(row, 'Client ID')

    // Determine CustomerType from packaging
    let type: CustomerType = 'Wholesale'
    if (packaging.toLowerCase().includes('retail')) type = 'Rustic Retail'
    else if (packaging.toLowerCase().includes('market')) type = 'Farmers Market'

    // Build pricing from product columns
    const pricing: Record<string, number> = {}
    headers.forEach((header, idx) => {
      if (NON_PRODUCT_COLS.has(header.toLowerCase())) return
      const productId = CSV_PRODUCT_MAP[header]
      if (!productId) return
      const raw = (row[idx] || '').trim().replace(/[$,]/g, '')
      const price = parseFloat(raw)
      if (!isNaN(price) && price > 0) {
        pricing[productId] = price
      }
    })

    customers.push({
      name,
      type,
      route: col(row, 'Route'),
      distributor: col(row, 'Distributor'),
      packagingType: packaging,
      freshbooksClientId: freshbooksClientId || '',
      email: email && email !== 'N/A' ? email : '',
      address: col(row, 'Address'),
      notes: col(row, 'Delivery Notes'),
      code: '',
      callNumber: '',
      deliveryInfo: col(row, 'Route'),
      phone: '',
      active,
      pricing,
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
        // Debug: log first few lines to console
        const lines = text.replace(/\uFEFF/g, '').split(/\r?\n/).filter(l => l.trim())
        console.error('Parse failed. Line count:', lines.length)
        console.error('Header line:', lines[0]?.substring(0, 200))
        console.error('First data row:', lines[1]?.substring(0, 200))
        toast.error('No customers found — check browser console for details')
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
                    <th className="text-left px-4 py-2 text-bark-600">Prices</th>
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
                      <td className="px-4 py-2 text-bark-600">{Object.keys(row.customer.pricing || {}).length} products</td>
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
