// Firestore access for the Ingredient Usage page.
// Collection: ingredientWeeks/{weekEnding yyyy-MM-dd}  (admin-only in the Firestore rules)
// Reads the daily Mix Log (mixLogs/{date}) that David fills in.
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { MixLogDay } from './labor'
import { WeekInput, weekDates } from './ingredients'

const WEEKS_COL = 'ingredientWeeks'

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? null : v)))
}

export interface SavedWeek extends WeekInput {
  weekEnding: string
  updatedAt?: string
  updatedBy?: string
}

export const ingredientsDb = {
  async getWeek(weekEnding: string): Promise<SavedWeek | null> {
    const snap = await getDoc(doc(db, WEEKS_COL, weekEnding))
    if (!snap.exists()) return null
    const d = snap.data() as Partial<SavedWeek>
    return {
      weekEnding,
      counts: d.counts || {},
      fixed: d.fixed || {},
      kiloOverrides: d.kiloOverrides || {},
      updatedAt: d.updatedAt,
      updatedBy: d.updatedBy,
    }
  },
  async saveWeek(weekEnding: string, input: WeekInput, by: string): Promise<void> {
    await setDoc(doc(db, WEEKS_COL, weekEnding), clean({
      weekEnding, counts: input.counts, fixed: input.fixed, kiloOverrides: input.kiloOverrides,
      updatedAt: new Date().toISOString(), updatedBy: by,
    }))
  },
  // The seven Mix Log days that make up a week (null where nothing was logged).
  async getMixLogs(weekEnding: string): Promise<(MixLogDay | null)[]> {
    return Promise.all(weekDates(weekEnding).map(async date => {
      const snap = await getDoc(doc(db, 'mixLogs', date))
      if (!snap.exists()) return null
      const d = snap.data() as Partial<MixLogDay>
      return { ...d, date, people: d.people || [], doughs: d.doughs || {} } as MixLogDay
    }))
  },
}
