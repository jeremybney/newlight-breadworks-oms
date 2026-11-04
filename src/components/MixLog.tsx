'use client'
// Daily mix log: who mixed, shift start/end, and kilos mixed per dough.
// Used on the Production page. The Labor page reads it to show mixing hours and efficiency.
import { useEffect, useMemo, useState } from 'react'
import { laborDb } from '@/lib/laborDb'
import { MIX_DOUGHS, MixLogDay, MixPerson, mixLogHours, mixLogKg, personHours } from '@/lib/labor'
import { Plus, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'

const NAMES_KEY = 'nlb-mix-names'

function rid() {
  return Math.random().toString(36).slice(2, 9)
}

function loadNames(): string[] {
  try {
    const raw = localStorage.getItem(NAMES_KEY)
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rememberNames(names: string[]) {
  try {
    const merged = Array.from(new Set([...loadNames(), ...names.map(n => n.trim()).filter(Boolean)])).slice(0, 20)
    localStorage.setItem(NAMES_KEY, JSON.stringify(merged))
  } catch {
    // browser storage can be blocked; the log still saves
  }
}

const blankPerson = (): MixPerson => ({ id: rid(), name: '', start: '', end: '' })

export default function MixLog({ date }: { date: string }) {
  const [saved, setSaved] = useState<MixLogDay | null>(null)
  const [people, setPeople] = useState<MixPerson[]>([blankPerson()])
  const [doughs, setDoughs] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [names, setNames] = useState<string[]>([])

  useEffect(() => { setNames(loadNames()) }, [])

  // Load the saved log whenever the date changes.
  useEffect(() => {
    setLoaded(false)
    setDirty(false)
    return laborDb.subscribeMixLog(date, log => {
      setSaved(log)
      setLoaded(true)
    })
  }, [date])

  // Copy the saved log into the form unless the person is in the middle of typing.
  const savedKey = JSON.stringify(saved)
  useEffect(() => {
    if (dirty) return
    setPeople(saved?.people?.length ? saved.people : [blankPerson()])
    const d: Record<string, string> = {}
    Object.entries(saved?.doughs || {}).forEach(([k, v]) => { if (v) d[k] = String(v) })
    setDoughs(d)
    setNotes(saved?.notes || '')
  }, [date, savedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const draft: MixLogDay = useMemo(() => {
    const dd: Record<string, number> = {}
    Object.entries(doughs).forEach(([k, v]) => { const n = parseFloat(v); if (n > 0) dd[k] = n })
    return {
      date,
      people: people.filter(p => p.name.trim() || p.start || p.end).map(p => ({ ...p, name: p.name.trim() })),
      doughs: dd,
      notes: notes.trim(),
    }
  }, [date, people, doughs, notes])

  const hours = mixLogHours(draft)
  const kg = mixLogKg(draft)
  const outsideKg = draft.doughs['pretzels'] || 0

  function updatePerson(id: string, patch: Partial<MixPerson>) {
    setPeople(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)))
    setDirty(true)
  }

  async function save() {
    const incomplete = draft.people.find(p => !p.name || !p.start || !p.end)
    if (incomplete) {
      toast.error('Each person needs a name, a start time and an end time.')
      return
    }
    setSaving(true)
    try {
      await laborDb.saveMixLog(draft)
      rememberNames(draft.people.map(p => p.name))
      setNames(loadNames())
      setDirty(false)
      toast.success('Mix log saved')
    } catch {
      toast.error('Could not save the mix log. Ask Ren to check the database rules.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 p-3 rounded-lg bg-wheat-100 border border-wheat-300 text-sm text-bark-800/70">
        <b>Mix log</b> for production day {date}. Add everyone who mixed, with the time they started and finished,
        then the kilos mixed for each dough. Overnight shifts are fine (for example 11:00 PM to 6:00 AM).
        {!loaded && <span className="ml-2 text-bark-800/50">Loading…</span>}
      </div>

      <div className="card p-5 mb-5">
        <div className="font-display text-lg text-bark-900 mb-3">Who mixed</div>
        <datalist id="mix-names">{names.map(n => <option key={n} value={n} />)}</datalist>
        {people.map(p => (
          <div key={p.id} className="grid grid-cols-12 gap-2 items-end mb-2">
            <div className="col-span-12 md:col-span-4">
              <label className="label">Name</label>
              <input className="input" list="mix-names" value={p.name} onChange={e => updatePerson(p.id, { name: e.target.value })} />
            </div>
            <div className="col-span-5 md:col-span-3">
              <label className="label">Start</label>
              <input className="input" type="time" value={p.start} onChange={e => updatePerson(p.id, { start: e.target.value })} />
            </div>
            <div className="col-span-5 md:col-span-3">
              <label className="label">End</label>
              <input className="input" type="time" value={p.end} onChange={e => updatePerson(p.id, { end: e.target.value })} />
            </div>
            <div className="col-span-2 md:col-span-2 flex items-center justify-between pb-2 text-sm">
              <span className="font-mono">{personHours(p).toFixed(2)} h</span>
              <button
                type="button" aria-label="Remove person" className="text-bark-800/50 hover:text-red-700"
                onClick={() => { setPeople(prev => (prev.length > 1 ? prev.filter(x => x.id !== p.id) : [blankPerson()])); setDirty(true) }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="btn-secondary flex items-center gap-2 mt-2" onClick={() => { setPeople(prev => [...prev, blankPerson()]); setDirty(true) }}>
          <Plus className="w-4 h-4" /> Add person
        </button>
      </div>

      <div className="card p-5 mb-5">
        <div className="font-display text-lg text-bark-900 mb-3">Kilos mixed</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {MIX_DOUGHS.map(d => (
            <div key={d.id}>
              <label className="label">{d.label}</label>
              <input
                className="input" type="number" min="0" step="0.1" inputMode="decimal"
                value={doughs[d.id] || ''}
                onChange={e => { setDoughs(prev => ({ ...prev, [d.id]: e.target.value })); setDirty(true) }}
              />
            </div>
          ))}
        </div>
        <div className="mt-4">
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={2} value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }} />
        </div>
      </div>

      <div className="card p-4 mb-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div><span className="text-bark-800/60">Mix hours</span> <b className="font-mono">{hours.toFixed(2)}</b></div>
        <div><span className="text-bark-800/60">Total kg</span> <b className="font-mono">{kg.toFixed(1)}</b></div>
        <div><span className="text-bark-800/60">kg per mix hour</span> <b className="font-mono">{hours > 0 && kg > 0 ? (kg / hours).toFixed(0) : '—'}</b></div>
        {outsideKg > 0 && <div className="text-bark-800/50">Pretzel kg ({outsideKg}) is not counted.</div>}
      </div>

      <button className="btn-primary flex items-center gap-2" onClick={save} disabled={saving}>
        <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save mix log'}
      </button>
      {saved?.updatedAt && !dirty && (
        <span className="ml-3 text-xs text-bark-800/50">Saved {new Date(saved.updatedAt).toLocaleString()}</span>
      )}
      {dirty && <span className="ml-3 text-xs text-bark-800/60">Unsaved changes</span>}
    </div>
  )
}
