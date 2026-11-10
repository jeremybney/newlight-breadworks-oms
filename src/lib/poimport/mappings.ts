// Customer-specific mappings for the PO Importer v1.
// These live in code on purpose: v1 does not create or change any Firestore mapping data.
// Product IDs are OMS product IDs (src/lib/products.ts / the live `products` collection).

export interface ProductMapping {
  codes: string[]          // customer item codes (upper case)
  descriptions: string[]   // customer descriptions (normalized: lower case, single spaces)
  productId: string
  slicing: string          // '' means no slicing
  confirmed: boolean       // false = needs review before it can be used
  note?: string
}

export const normText = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// Address key = lower case, punctuation removed, single spaces. A file matches when its
// normalized address starts with the key.
export const normAddress = (s: string) =>
  s.toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()

// ─── MAMAN ───────────────────────────────────────────────────────────────────
export const MAMAN_LOCATIONS: { addressKey: string; customerName: string }[] = [
  { addressKey: '211 w broadway', customerName: 'Maman - Tribeca' },
  { addressKey: '375 hudson st', customerName: 'Maman - King' },
  { addressKey: '239 centre st', customerName: 'Maman - Soho' },
]

export const MAMAN_PRODUCTS: ProductMapping[] = [
  {
    codes: ['SD302'],
    descriptions: ['large sourdough batard'],
    productId: 'large-batard',
    slicing: 'TH Sliced',
    confirmed: true,
  },
  {
    codes: [],
    descriptions: ['milk bread (large) (th sliced)'],
    productId: 'mb-large',
    slicing: 'TH Sliced',
    confirmed: true,
  },
  {
    codes: [],
    descriptions: ['milk bread large (thick sliced) (th sliced)'],
    productId: 'mb-large',
    slicing: 'TH Sliced',
    confirmed: true,
  },
  {
    // Confirmed by Ren: Maman "Brioche Bun" is Newlight's 5" Milk Burger Bun, unsliced.
    // The only matching catalog product is `mb-5in-burger-bun` ('5" Milk Burger Buns').
    // `mb-5in-burger-seeded` is the seeded version and is NOT this item.
    codes: ['ML501'],
    descriptions: ['brioche bun'],
    productId: 'mb-5in-burger-bun',
    slicing: '',
    confirmed: true,
  },
  {
    // Confirmed by Ren: base product + TH Sliced slicing field, the same way the OMS stores
    // customer slicing defaults (never the separate legacy product `large-batard-sliced`).
    codes: [],
    descriptions: ['large batard (th sliced)'],
    productId: 'large-batard',
    slicing: 'TH Sliced',
    confirmed: true,
  },
]

// ─── WESTVILLE ───────────────────────────────────────────────────────────────
// Keyed by the "Location :" text on the PO.
export const WESTVILLE_LOCATIONS: { location: string; customerName: string }[] = [
  { location: 'westville west', customerName: 'Westville - Hudson' },
  { location: 'westville hk', customerName: 'Westville - Hells Kitchen' },
  { location: 'westville wall street', customerName: 'Westville - Wall St' }, // not "Prep Kitchen (Wall St)"
]

// Any other "Westville <Name>" location is looked up as the customer "Westville - <Name>"
// (for example "Westville LIC" -> "Westville - LIC"), and must exist in the customer list.
export function westvilleDerivedName(location: string): string | null {
  const m = location.trim().match(/^westville\s+(.+)$/i)
  return m ? `Westville - ${m[1].trim()}` : null
}

// Keyed by the PO's Vendor Description (our product name as Westville has it).
// Westville POs carry no slicing, so slicing is left to the customer default in the OMS.
export const WESTVILLE_PRODUCTS: ProductMapping[] = [
  // 'mutligrain batard' is a spelling Westville's PO actually uses (seen on PO 196114)
  { codes: [], descriptions: ['multigrain batard', 'mutligrain batard'], productId: 'mg-batard', slicing: '', confirmed: true },
  { codes: [], descriptions: ['milk bread (large)'], productId: 'mb-large', slicing: '', confirmed: true },
  { codes: [], descriptions: ['24 sourdough baguette'], productId: 'sd-baguette-24in', slicing: '', confirmed: true },
]

// ─── MAMAN DELIVERY RULE ─────────────────────────────────────────────────────
// Weekday the email was received (New York) -> days until delivery.
// Mon->Wed, Tue->Thu, Wed->Fri, Thu->Sat, Fri->Sun, Sat->Tue, Sun->Tue
export const MAMAN_DELIVERY_OFFSET_DAYS: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 3, 0: 2,
}
