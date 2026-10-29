// Firestore access for the Labor tab.
// Collections:  laborConfig/standards, laborConfig/roster, laborDays/{productionDate}
// IMPORTANT: restrict these collections to admins in the Firestore security rules.
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { LaborDay, LaborStandards, Roster, mergeStandards } from './labor'

const CONFIG_COL = 'laborConfig'
const DAYS_COL = 'laborDays'

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
}
