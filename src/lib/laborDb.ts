// Firestore access for the Labor tab.
// Collections:  laborConfig/standards, laborConfig/roster, laborDays/{productionDate}, mixLogs/{productionDate}
// IMPORTANT: laborConfig and laborDays are admin-only in the Firestore rules. mixLogs can be written by any signed-in staff.
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { LaborDay, LaborStandards, MixLogDay, Roster, ShapeMap, mergeStandards } from './labor'

const CONFIG_COL = 'laborConfig'
const DAYS_COL = 'laborDays'
const MIX_COL = 'mixLogs'

// Firestore rejects `undefined`; this strips it (and keeps nulls).
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v)))
}

export const laborDb = {
  async getStandards(): Promise<LaborStandards> {
    const snap = await getDoc(doc(db, CONFIG_COL, 'standards'))
    return mergeStandards(snap.exists() ? (snap.data() as Partial<LaborStandards>) : null)
  },
  async saveStandards(standards: LaborStandards): Promise<void> {
    await setDoc(doc(db, CONFIG_COL, 'standards'), clean(standards))
  },

  async getRoster(): Promise<Roster> {
    const snap = await getDoc(doc(db, CONFIG_COL, 'roster'))
    return snap.exists() ? ((snap.data() as { people?: Roster }).people || {}) : {}
  },
  async saveRoster(roster: Roster): Promise<void> {
    await setDoc(doc(db, CONFIG_COL, 'roster'), clean({ people: roster }))
  },

  async getShapeMap(): Promise<ShapeMap> {
    const snap = await getDoc(doc(db, CONFIG_COL, 'shapeMap'))
    return snap.exists() ? ((snap.data() as { map?: ShapeMap }).map || {}) : {}
  },
  async saveShapeMap(map: ShapeMap): Promise<void> {
    await setDoc(doc(db, CONFIG_COL, 'shapeMap'), clean({ map }))
  },

  subscribeDay(date: string, cb: (day: LaborDay | null) => void) {
    return onSnapshot(
      doc(db, DAYS_COL, date),
      snap => cb(snap.exists() ? ({ date, ...(snap.data() as Omit<LaborDay, 'date'>) } as LaborDay) : null),
      () => cb(null),
    )
  },
  async saveDay(day: LaborDay): Promise<void> {
    await setDoc(doc(db, DAYS_COL, day.date), clean(day), { merge: true })
  },

  // The daily mix log is written by whoever mixed (David) and read by the Labor page.
  subscribeMixLog(date: string, cb: (log: MixLogDay | null) => void) {
    return onSnapshot(
      doc(db, MIX_COL, date),
      snap => {
        if (!snap.exists()) return cb(null)
        const d = snap.data() as Partial<MixLogDay>
        cb({ ...d, date, people: d.people || [], doughs: d.doughs || {} })
      },
      () => cb(null),
    )
  },
  async saveMixLog(log: MixLogDay): Promise<void> {
    await setDoc(doc(db, MIX_COL, log.date), clean({ ...log, updatedAt: new Date().toISOString() }))
  },
}
