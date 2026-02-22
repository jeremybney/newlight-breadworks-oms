'use client'
import { useState, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { customersService } from '@/lib/db'
import { Customer, CustomerType } from '@/types'
import { Upload, CheckCircle, XCircle, Loader2, AlertTriangle, Download } from 'lucide-react'
import toast from 'react-hot-toast'

// Maps every CSV column header to the product ID used in Firestore
const CSV_PRODUCT_MAP: Record<string, string> = {
  "Deli Rye (Retail)": "deli_rye__retail",
  "Large Sourdough Boule (Original)": "large_sourdough_boule__original",
  "Parker House Roll": "parker_house_roll",
  "Hamburger Bun": "hamburger_bun",
  "Demi Sourdough Baguette": "demi_sourdough_baguette",
  "24\" Sourdough Baguette": "24__sourdough_baguette",
  "Ciabatta (Small)": "ciabatta__small",
  "Multigrain (Retail)": "multigrain__retail",
  "Milk Bread (Large) (TH Sliced)": "milk_bread__large___th_sliced",
  "Milk Bread (Retail)": "milk_bread__retail",
  "5\" Milk Burger Buns (Seeded)": "5__milk_burger_buns__seeded",
  "Semolina Hoagie (Large)": "semolina_hoagie__large",
  "5\" Milk Burger Buns": "5__milk_burger_buns",
  "Croissant": "croissant",
  "Italian Hoagie 9\"": "italian_hoagie_9",
  "4\" Boule": "4__boule",
  "Deli Rye (Large)": "deli_rye__large",
  "Large Sourdough Boule (Seeded)": "large_sourdough_boule__seeded",
  "Parker House (Seeded)": "parker_house__seeded",
  "Large Hamburger Bun": "large_hamburger_bun",
  "Italian Baguette": "italian_baguette",
  "Demi Italian Baguette": "demi_italian_baguette",
  "Ciabatta (Large)": "ciabatta__large",
  "Multigrain (Large)": "multigrain__large",
  "Large Pretzel Loop (Salted)": "large_pretzel_loop__salted",
  "Milk Bread (Large)": "milk_bread__large",
  "Italian Hoagie (170g)": "italian_hoagie__170g",
  "Medium Ciabatta": "medium_ciabatta",
  "Challah Rolls": "challah_rolls",
  "White Bread (Large)": "white_bread__large",
  "Mini Parker House Roll": "mini_parker_house_roll",
  "Sourdough Batard (Seeded)": "sourdough_batard__seeded",
  "Semolina": "semolina",
  "Sourdough Pullman (Large)": "sourdough_pullman__large",
  "Dinner Roll": "dinner_roll",
  "Hamburger Bun (Seeded)": "hamburger_bun__seeded",
  "Sourdough Baguette": "sourdough_baguette",
  "Rye Hoagie": "rye_hoagie",
  "Ciabatta": "ciabatta",
  "Multigrain Boule": "multigrain_boule",
  "Pretzel Hero 7\" (No Salt)": "pretzel_hero_7___no_salt",
  "5\" Boule": "5__boule",
  "Multigrain Batard": "multigrain_batard",
  "Semolina Hoagie": "semolina_hoagie",
  "Ficelle": "ficelle",
  "Whole Wheat Hoagie": "whole_wheat_hoagie",
  "Pretzel Burger Bun": "pretzel_burger_bun",
  "3\" Hot Dog Bun": "3__hot_dog_bun",
  "Brioche (Retail)": "brioche__retail",
  "Mini Hot Dog Bun": "mini_hot_dog_bun",
  "Sourdough Focaccia (Retail)": "sourdough_focaccia__retail",
  "Sourdough Batard": "sourdough_batard",
  "17\" Multigrain Baguette": "17__multigrain_baguette",
  "Mini Deli Rye Roll": "mini_deli_rye_roll",
  "Mini Semolina Roll (Seeded)": "mini_semolina_roll__seeded",
  "Multigrain Dinner Roll": "multigrain_dinner_roll",
  "Brioche (Large)": "brioche__large",
  "Sourdough Focaccia (Wholesale)": "sourdough_focaccia__wholesale",
  "Hot Dog Bun": "hot_dog_bun",
  "Large Batard": "large_batard",
  "Large Pretzel Loop (Unsalted)": "large_pretzel_loop__unsalted",
  "Mini Milk Bread Roll": "mini_milk_bread_roll",
  "Mini Sourdough Roll": "mini_sourdough_roll",
  "Italian Dinner Roll": "italian_dinner_roll",
  "Jumbo Pretzel Loop (Salted)": "jumbo_pretzel_loop__salted",
  "24\" Semolina Baguette": "24__semolina_baguette",
  "Milk Bread Slider": "milk_bread_slider",
  "Pretzel Parker House Roll": "pretzel_parker_house_roll",
  "Multigrain Hoagie": "multigrain_hoagie",
  "Mini Multigrain Roll": "mini_multigrain_roll",
  "Potato Milk Bread Roll": "potato_milk_bread_roll",
  "Sourdough Burger Bun": "sourdough_burger_bun",
  "Semolina Burger Bun": "semolina_burger_bun",
  "6\" Ciabatta": "6__ciabatta",
  "9\" Ciabatta": "9__ciabatta",
  "Deli Rye Dinner Rol": "deli_rye_dinner_rol",
  "Italian Burger Bun": "italian_burger_bun",
  "Large Batard (TH Sliced)": "large_batard__th_sliced",
  "Italian Batard": "italian_batard",
  "Milk Bread (Large) (Sliced)": "milk_bread__large___sliced",
  "Sourdough Focaccia (Half Sheet)": "sourdough_focaccia__half_sheet",
  "Italian Slider 3\"": "italian_slider_3",
  "Italian Burger Bun (100g)": "italian_burger_bun__100g",
  "2.5\" Milk Bread Slider (Seeded)": "2_5__milk_bread_slider__seeded",
  "24\" Italian Baguette": "24__italian_baguette",
  "Mini Multigrain Boule": "mini_multigrain_boule",
  "24\" Italian Baguette (Deck)": "24__italian_baguette__deck",
  "Large Hamburger Bun (Seeded)": "large_hamburger_bun__seeded",
  "Hamburger Bun (Everything)": "hamburger_bun__everything",
  "8\" Hot Dog Bun": "8__hot_dog_bun",
  "8\" Hot Dog Bun (Seeded)": "8__hot_dog_bun__seeded",
  "Multigrain Burger Bun": "multigrain_burger_bun",
  "Semolina Mini Baguette": "semolina_mini_baguette",
  "2.5\" Milk Bread Slider": "2_5__milk_bread_slider",
  "Light Rye Sandwich": "light_rye_sandwich",
  "Whole Wheat Sandwich": "whole_wheat_sandwich",
  "Semolina Twist": "semolina_twist",
  "Challah Parker House Rolls": "challah_parker_house_rolls",
  "Milk Bun Twist (seeded)": "milk_bun_twist__seeded",
  "4\" Milk Burger Bun": "4__milk_burger_bun",
  "4\" Kaiser Roll": "4__kaiser_roll",
  "Kaiser Roll Slider": "kaiser_roll_slider",
  "Sour Display": "sour_display",
  "White Sandwich": "white_sandwich",
  "Plain Croissant": "plain_croissant",
  "Chocolate Croissant": "chocolate_croissant",
  "Mini Baguette (Salted)": "mini_baguette__salted",
  "Milk Bread Cone": "milk_bread_cone",
  "3' Hoagie": "3__hoagie",
  "Pumpernickle Sandwich": "pumpernickle_sandwich",
  "Coco Bread": "coco_bread",
  "Challah Burger Bun": "challah_burger_bun"
}

const META_COLS = new Set([
  'CURRENT PRICING', 'Packaging', 'Delivery', 'Call #', 'Notes', 'ROUTE', 'CODE',
  'FRESHBOOKS ID', 'Email', 'Delivery instructions', 'Is this a recurring delivery?',
  'Fuel surcharge', 'Delivery Date', 'Form Host', 'Reference ID', 'IP',
  'Recurring delivery end date', '', 'X'
])

function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === '\n' && !inQuotes) { lines.push(current); current = '' }
    else { current += ch }
  }
  if (current) lines.push(current)

  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let cell = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cells.push(cell.trim()); cell = '' }
      else { cell += ch }
    }
    cells.push(cell.trim())
    return cells
  }

  const headers = parseRow(lines[0])
  return lines.slice(1).map(line => {
    const cells = parseRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] || '' })
    return row
  })
}

function rowToCustomer(row: Record<string, string>): Omit<Customer, 'id' | 'createdAt'> | null {
  const name = row['CURRENT PRICING']?.trim()
  if (!name) return null

  const pricing: Record<string, number> = {}
  for (const [csvCol, productId] of Object.entries(CSV_PRODUCT_MAP)) {
    const val = row[csvCol]?.trim()
    if (val && !isNaN(parseFloat(val))) {
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
  status: 'pending' | 'importing' | 'done' | 'error' | 'skipped'
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
      const parsed = parseCSV(text)
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
      const row = rows[i]
      if (row.status === 'done' || row.status === 'skipped') {
        completed++
        continue
      }

      setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'importing' } : r))

      try {
        await customersService.create(row.customer)
        completed++
        setProgress(Math.round((completed / rows.length) * 100))
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done' } : r))
      } catch (err: any) {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: err.message } : r))
        completed++
      }

      // Small delay to avoid Firestore rate limits
      await new Promise(res => setTimeout(res, 100))
    }

    setImporting(false)
    setDone(true)
    const succeeded = rows.filter((_, i) => rows[i]?.status !== 'error').length
    toast.success(`Import complete! ${completed} customers imported.`)
  }

  const summary = {
    total: rows.length,
    pending: rows.filter(r => r.status === 'pending').length,
    done: rows.filter(r => r.status === 'done').length,
    error: rows.filter(r => r.status === 'error').length,
    withPricing: rows.filter(r => r.pricedProducts > 0).length,
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="section-header">Bulk Customer Import</h1>
          <p className="text-bark-800/60 text-sm">Upload your pricing spreadsheet CSV to import all customers at once</p>
        </div>

        {/* Upload Area */}
        {rows.length === 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-wheat-400/50 rounded-xl p-16 text-center hover:border-wheat-500 hover:bg-wheat-400/5 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-wheat-400 mx-auto mb-4" />
            <h3 className="font-display text-xl text-bark-900 mb-2">Drop your CSV file here</h3>
            <p className="text-bark-800/60 text-sm mb-4">
              Use the same format as your <strong>Newlight Bread Orders Starter - Prices</strong> spreadsheet
            </p>
            <div className="btn-primary inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" /> Choose File
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        )}

        {/* Preview + Import */}
        {rows.length > 0 && (
          <>
            {/* Summary Bar */}
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

            {/* Progress Bar */}
            {importing && (
              <div className="card p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-mono text-bark-800/70">Importing...</span>
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
                  Import complete — <strong>{summary.done}</strong> customers added to your database.
                  {summary.error > 0 && <span className="text-ember-500"> {summary.error} failed.</span>}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            {!done && (
              <div className="flex gap-3 mb-5">
                <button onClick={handleImport} disabled={importing}
                  className="btn-primary flex items-center gap-2">
                  {importing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing {summary.done}/{summary.total}...</>
                    : <><CheckCircle className="w-4 h-4" /> Import All {summary.total} Customers</>}
                </button>
                <button onClick={() => { setRows([]); setDone(false) }} disabled={importing}
                  className="btn-secondary">
                  Clear & Start Over
                </button>
              </div>
            )}

            {/* Customer Preview Table */}
            <div className="card overflow-hidden">
              <div className="overflow-y-auto max-h-[500px]">
                <table className="table-base w-full">
                  <thead className="sticky top-0">
                    <tr>
                      <th className="bg-cream-200 text-left">Customer</th>
                      <th className="bg-cream-200">Route</th>
                      <th className="bg-cream-200">Code</th>
                      <th className="bg-cream-200">Packaging</th>
                      <th className="bg-cream-200 text-center">Priced Products</th>
                      <th className="bg-cream-200 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={row.status === 'done' ? 'opacity-50' : ''}>
                        <td className="font-medium text-bark-900">{row.name}</td>
                        <td className="text-center font-mono text-xs">{row.customer.route || '—'}</td>
                        <td className="text-center font-mono text-xs">{row.customer.code || '—'}</td>
                        <td className="text-center text-xs">{row.customer.packagingType || '—'}</td>
                        <td className="text-center font-mono text-sm">
                          {row.pricedProducts > 0
                            ? <span className="text-sage-600">{row.pricedProducts}</span>
                            : <span className="text-bark-800/30">0</span>}
                        </td>
                        <td className="text-center">
                          {row.status === 'pending' && <span className="badge bg-cream-200 text-bark-800/50">Ready</span>}
                          {row.status === 'importing' && <Loader2 className="w-4 h-4 animate-spin text-wheat-500 mx-auto" />}
                          {row.status === 'done' && <CheckCircle className="w-4 h-4 text-sage-500 mx-auto" />}
                          {row.status === 'error' && (
                            <span title={row.error}><XCircle className="w-4 h-4 text-ember-500 mx-auto" /></span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Instructions */}
        <div className="mt-6 card p-5 text-sm text-bark-800/70 space-y-2">
          <div className="font-display text-bark-900 mb-2">How it works</div>
          <div className="flex gap-2"><span className="text-wheat-500 font-bold">1.</span> Export your pricing spreadsheet as CSV (File → Download → CSV)</div>
          <div className="flex gap-2"><span className="text-wheat-500 font-bold">2.</span> Drop or upload the CSV file above</div>
          <div className="flex gap-2"><span className="text-wheat-500 font-bold">3.</span> Preview the customers that will be imported</div>
          <div className="flex gap-2"><span className="text-wheat-500 font-bold">4.</span> Click Import — all customers and their pricing are added automatically</div>
          <div className="flex gap-2"><AlertTriangle className="w-4 h-4 text-wheat-500 flex-shrink-0 mt-0.5" /><span>If you run the import twice, duplicate customers will be created. Only import once, or clear existing customers first.</span></div>
        </div>
      </div>
    </AppShell>
  )
}
