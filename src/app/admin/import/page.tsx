'use client'
import { useState, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService } from '@/lib/db'
import { Customer, CustomerType } from '@/types'
import { Upload, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

// Maps CSV column headers (with " inch marks stripped by parser) -> product IDs
const CSV_PRODUCT_MAP: Record<string, string> = {
  "Deli Rye (Large)": "rye-large",
  "Deli Rye (Retail)": "rye-retail",
  "Deli Rye Dinner Rol": "rye-dinner-roll",
  "Mini Deli Rye Roll": "mini-deli-rye-roll",
  "Rye Hoagie": "rye-hoagie",
  "Light Rye Sandwich": "light-rye-sandwich",
  "Multigrain (Large)": "mg-large",
  "Multigrain (Retail)": "mg-retail",
  "Multigrain Boule": "mg-boule",
  "Multigrain Batard": "mg-batard",
  "17 Multigrain Baguette": "mg-baguette",
  "Multigrain Hoagie": "mg-hoagie",
  "Multigrain Burger Bun": "mg-burger-bun",
  "Multigrain Dinner Roll": "mg-dinner-roll",
  "Mini Multigrain Roll": "mg-mini-roll",
  "Whole Wheat Hoagie": "whole-wheat-hoagie",
  "Mini Multigrain Boule": "mg-boule",
  "5 Milk Burger Buns": "mb-5in-burger-bun",
  "5 Milk Burger Buns (Seeded)": "mb-5in-burger-seeded",
  "4 Milk Burger Bun": "mb-4in-burger-bun",
  "2.5 Milk Bread Slider (Seeded)": "mb-bread-slider-seeded",
  "2.5 Milk Bread Slider": "mb-bread-slider",
  "Milk Bread (Large)": "mb-large",
  "Milk Bread (Retail)": "mb-retail",
  "Milk Bread (Large) (TH Sliced)": "mb-large-fit-sliced",
  "Milk Bread (Large) (Sliced)": "mb-large-sliced",
  "Mini Milk Bread Roll": "mb-mini-loaf-roll",
  "Milk Bread Slider": "mb-bread-slider",
  "Milk Bread Cone": "mb-mini-loaf-roll",
  "Milk Bun Twist (seeded)": "mb-5in-burger-seeded",
  "Brioche (Retail)": "brioche-pullman-retail",
  "Brioche (Large)": "brioche-pullman-large",
  "Hamburger Bun (Seeded)": "bun-sesame-seeded",
  "Hamburger Bun (Everything)": "bun-everything",
  "Hamburger Bun": "bun-plain",
  "Mini Parker House Roll": "bun-mini-hamburger",
  "Large Hamburger Bun": "bun-large-hamburger",
  "Large Hamburger Bun (Seeded)": "bun-large-seeded",
  "Parker House Roll": "parker-house-roll",
  "Parker House (Seeded)": "parker-house-roll-oeuf",
  "Hot Dog Bun": "hotdog-bun",
  "8 Hot Dog Bun": "hotdog-bun-8in",
  "8 Hot Dog Bun (Seeded)": "hotdog-bun-8in",
  "Mini Hot Dog Bun": "hotdog-bun-mini",
  "3 Hot Dog Bun": "mini-hotdog-bun",
  "Dinner Roll": "parker-house-dinner",
  "Croissant": "croissant",
  "Plain Croissant": "plain-croissant",
  "Chocolate Croissant": "chocolate-croissant",
  "Italian Baguette": "italian-baguette",
  "Demi Italian Baguette": "demi-italian-baguette",
  "24 Italian Baguette": "italian-baguette-24in",
  "24 Italian Baguette (Deck)": "italian-baguette-24in",
  "Italian Hoagie 9": "italian-hoagie",
  "Italian Hoagie (170g)": "italian-hoagie-170g",
  "Italian Slider 3": "italian-slider",
  "Italian Burger Bun": "italian-burger-bun",
  "Italian Burger Bun (100g)": "italian-burger-bun",
  "Italian Batard": "italian-batard",
  "Ciabatta (Large)": "ciabatta-large",
  "Ciabatta (Small)": "ciabatta-small",
  "Medium Ciabatta": "ciabatta-medium",
  "Ciabatta": "ciabatta-large",
  "6 Ciabatta": "ciabatta-small",
  "9 Ciabatta": "ciabatta-large",
  "Italian Dinner Roll": "italian-dinner-roll",
  "4 Kaiser Roll": "kaiser-roll",
  "Kaiser Roll Slider": "kaiser-roll-slider",
  "Ficelle": "ficelle",
  "24 Sourdough Baguette": "sd-baguette-24in",
  "Sourdough Focaccia (Wholesale)": "sd-focaccia-wholesale",
  "Sourdough Focaccia (Retail)": "sd-focaccia-retail",
  "Sourdough Focaccia (Half Sheet)": "sd-focaccia-half",
  "Sourdough Baguette": "sd-baguette",
  "Demi Sourdough Baguette": "demi-sd-baguette",
  "Sourdough Pullman (Large)": "sd-pullman-large",
  "Sourdough Burger Bun": "sd-burger-bun",
  "Mini Sourdough Roll": "mini-sd-roll",
  "Sour Display": "sd-baguette",
  "Mini Baguette (Salted)": "demi-sd-baguette",
  "4 Boule": "boule-4in",
  "5 Boule": "boule-4in",
  "Large Sourdough Boule (Original)": "sd-boule-large-orig",
  "Large Sourdough Boule (Seeded)": "sd-boule-large-seeded",
  "Sourdough Batard": "sd-batard",
  "Sourdough Batard (Seeded)": "sd-batard-seeded",
  "Large Batard": "large-batard",
  "Large Batard (TH Sliced)": "large-batard-sliced",
  "Semolina": "semolina",
  "Semolina Hoagie": "semolina-hoagie",
  "24 Semolina Baguette": "semolina-baguette-24in",
  "Semolina Burger Bun": "semolina-burger-bun",
  "Mini Semolina Roll (Seeded)": "mini-semolina-roll",
  "Semolina Hoagie (Large)": "semolina-hoagie-lg",
  "Semolina Twist": "semolina-twist",
  "Semolina Mini Baguette": "semolina-mini-baguette",
  "Large Pretzel Loop (Salted)": "pretzel-loop-lg-sliced",
  "Large Pretzel Loop (Unsalted)": "pretzel-loop-lg-soft",
  "Jumbo Pretzel Loop (Salted)": "jumbo-pretzel-sliced",
  "Pretzel Hero 7 (No Salt)": "pretzel-hero-nosalt",
  "Pretzel Burger Bun": "pretzel-burger-bun",
  "Pretzel Parker House Roll": "pretzel-parker-house",
  "Challah Rolls": "challah-roll",
  "Challah Parker House Rolls": "challah-parker-house",
  "Challah Burger Bun": "challah-burger-bun",
  "White Bread (Large)": "white-bread-large",
  "White Sandwich": "white-sandwich",
  "Potato Milk Bread Roll": "mb-mini-loaf-roll",
  "Whole Wheat Sandwich": "ww-sandwich",
  "3' Hoagie": "italian-hoagie",
  "Pumpernickle Sandwich": "light-rye-sandwich",
  "Coco Bread": "mb-large"
}

const META_COLS = new Set([
  'CURRENT PRICING', 'Packaging', 'Delivery', 'Call #', 'Notes', 'ROUTE', 'CODE',
  'FRESHBOOKS ID', 'Email', 'Delivery instructions', 'Is this a recurring delivery?',
  'Fuel surcharge', 'Delivery Date', 'Form Host', 'Reference ID', 'IP',
  'Recurring delivery end date', '', 'X'
])

// Robust CSV parser that correctly handles quoted fields containing commas
// Note: inch marks (") in column names like 5" Bun get stripped since CSV uses " as delimiter
function parseCSV(text: string): { headers: string[], rows: Record<string, string>[] } {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  function parseLine(line: string): string[] {
    const cells: string[] = []
    let cell = ''
    let inQuotes = false
    let i = 0
    while (i < line.length) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote "" inside quoted field
          cell += '"'
          i += 2
          continue
        }
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cells.push(cell.trim())
        cell = ''
      } else {
        cell += ch
      }
      i++
    }
    cells.push(cell.trim())
    return cells
  }

  const lines = normalized.split('\n').filter(l => l.trim())
  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const cells = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] || '' })
    return row
  })
  return { headers, rows }
}

function rowToCustomer(row: Record<string, string>): Omit<Customer, 'id' | 'createdAt'> | null {
  const name = row['CURRENT PRICING']?.trim()
  if (!name) return null

  const pricing: Record<string, number> = {}
  for (const [csvCol, productId] of Object.entries(CSV_PRODUCT_MAP)) {
    const val = row[csvCol]?.trim()
    if (val && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
      pricing[productId] = parseFloat(val)
    }
  }

  const typeRaw = row['Packaging']?.trim() || ''
  let type: CustomerType = 'Wholesale'
  if (typeRaw.toLowerCase().includes('retail')) type = 'Rustic Retail'
  else if (typeRaw.toLowerCase().includes('market')) type = 'Farmers Market'

  return {
    name,
    type,
    route: row['ROUTE']?.trim() || '',
    code: row['CODE']?.trim() || '',
    packagingType: row['Delivery']?.trim() || '',
    callNumber: row['Call #']?.trim() || '',
    notes: row['Notes']?.trim() || '',
    address: row['Delivery instructions']?.trim() || '',
    email: row['Email']?.trim() || '',
    phone: '',
    deliveryInfo: row['Delivery']?.trim() || '',
    active: true,
    pricing,
    slicing: {},
  }
}

type ImportRow = {
  name: string
  status: 'pending' | 'importing' | 'done' | 'error'
  error?: string
  pricedProducts: number
  customer: Omit<Customer, 'id' | 'createdAt'>
}

export default function ImportPage() {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { rows: parsed } = parseCSV(text)
      const importRows: ImportRow[] = []
      for (const row of parsed) {
        const customer = rowToCustomer(row)
        if (!customer) continue
        importRows.push({
          name: customer.name,
          status: 'pending',
          pricedProducts: Object.keys(customer.pricing).length,
          customer,
        })
      }
      setRows(importRows)
      setDone(false)
      setProgress(0)
      toast.success(`Found ${importRows.length} customers ready to import`)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    setImporting(true)
    let completed = 0
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === 'done') { completed++; continue }
      setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'importing' } : r))
      try {
        await customersService.create(rows[i].customer)
        completed++
        setProgress(Math.round((completed / rows.length) * 100))
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done' } : r))
      } catch (err: any) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: err.message } : r))
        completed++
      }
      await new Promise(res => setTimeout(res, 80))
    }
    setImporting(false)
    setDone(true)
    toast.success(`Import complete!`)
  }

  const summary = {
    total: rows.length,
    done: rows.filter(r => r.status === 'done').length,
    error: rows.filter(r => r.status === 'error').length,
    withPricing: rows.filter(r => r.pricedProducts > 0).length,
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="section-header">Bulk Customer Import</h1>
          <p className="text-bark-800/60 text-sm">Upload your pricing spreadsheet CSV to import all customers and their pricing at once</p>
        </div>

        {rows.length === 0 && (
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-wheat-400/50 rounded-xl p-16 text-center hover:border-wheat-500 hover:bg-wheat-400/5 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-wheat-400 mx-auto mb-4" />
            <h3 className="font-display text-xl text-bark-900 mb-2">Drop your CSV file here</h3>
            <p className="text-bark-800/60 text-sm mb-4">Use your <strong>Newlight Bread Orders Starter - Prices</strong> spreadsheet exported as CSV</p>
            <div className="btn-primary inline-flex items-center gap-2">
              <Upload className="w-4 h-4" /> Choose File
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Total Customers', value: summary.total, color: 'text-bark-900' },
                { label: 'With Pricing', value: summary.withPricing, color: 'text-wheat-700' },
                { label: 'Imported', value: summary.done, color: 'text-sage-600' },
                { label: 'Errors', value: summary.error, color: 'text-ember-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card px-4 py-3 text-center">
                  <div className={`font-display text-2xl ${color}`}>{value}</div>
                  <div className="text-xs text-bark-800/50 font-mono">{label}</div>
                </div>
              ))}
            </div>

            {importing && (
              <div className="card p-4 mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-mono text-bark-800/70">Importing {summary.done} of {summary.total}...</span>
                  <span className="text-sm font-mono text-wheat-600">{progress}%</span>
                </div>
                <div className="w-full bg-cream-200 rounded-full h-2">
                  <div className="bg-wheat-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {done && (
              <div className="bg-sage-400/10 border border-sage-400/30 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-sage-500" />
                <span className="text-sm text-bark-900">
                  Import complete — <strong>{summary.done}</strong> customers added.
                  {summary.error > 0 && <span className="text-ember-500 ml-1">{summary.error} failed.</span>}
                </span>
              </div>
            )}

            {!done && (
              <div className="flex gap-3 mb-5">
                <button onClick={handleImport} disabled={importing} className="btn-primary flex items-center gap-2">
                  {importing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                    : <><CheckCircle className="w-4 h-4" /> Import All {summary.total} Customers</>}
                </button>
                <button onClick={() => { setRows([]); setDone(false) }} disabled={importing} className="btn-secondary">
                  Clear & Start Over
                </button>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="overflow-y-auto max-h-[500px]">
                <table className="table-base w-full">
                  <thead className="sticky top-0">
                    <tr>
                      <th className="bg-cream-200 text-left">Customer</th>
                      <th className="bg-cream-200 text-center">Route</th>
                      <th className="bg-cream-200 text-center">Code</th>
                      <th className="bg-cream-200 text-center">Type</th>
                      <th className="bg-cream-200 text-center">Priced Products</th>
                      <th className="bg-cream-200 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={row.status === 'done' ? 'opacity-40' : ''}>
                        <td className="font-medium text-bark-900">{row.name}</td>
                        <td className="text-center font-mono text-xs">{row.customer.route || '—'}</td>
                        <td className="text-center font-mono text-xs">{row.customer.code || '—'}</td>
                        <td className="text-center text-xs">{row.customer.type}</td>
                        <td className="text-center font-mono text-sm">
                          {row.pricedProducts > 0
                            ? <span className="text-sage-600 font-semibold">{row.pricedProducts}</span>
                            : <span className="text-bark-800/30">0</span>}
                        </td>
                        <td className="text-center">
                          {row.status === 'pending' && <span className="badge bg-cream-200 text-bark-800/50 text-xs">Ready</span>}
                          {row.status === 'importing' && <Loader2 className="w-4 h-4 animate-spin text-wheat-500 mx-auto" />}
                          {row.status === 'done' && <CheckCircle className="w-4 h-4 text-sage-500 mx-auto" />}
                          {row.status === 'error' && <span title={row.error}><XCircle className="w-4 h-4 text-ember-500 mx-auto" /></span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="mt-6 card p-5 text-sm text-bark-800/70 space-y-2">
          <div className="font-display text-bark-900 mb-2">Instructions</div>
          <div className="flex gap-2"><span className="text-wheat-500 font-bold">1.</span> In Google Sheets, go to File → Download → CSV</div>
          <div className="flex gap-2"><span className="text-wheat-500 font-bold">2.</span> Upload that CSV file above — you will see a preview of all customers</div>
          <div className="flex gap-2"><span className="text-wheat-500 font-bold">3.</span> Click Import — pricing for each customer is saved automatically</div>
          <div className="flex gap-2"><AlertTriangle className="w-4 h-4 text-wheat-500 flex-shrink-0 mt-0.5" /><span>Running the import twice will create duplicate customers. Delete existing ones in Firebase first if you need to re-import.</span></div>
        </div>
      </div>
    </AppShell>
  )
}
