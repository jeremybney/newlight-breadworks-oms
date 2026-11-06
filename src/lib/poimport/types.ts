// PO Importer v1 (read-only). Shared types.
// Nothing in this folder writes to Firebase.

export type Severity = 'blocking' | 'warning' | 'info'

export interface Issue {
  severity: Severity
  code: string
  message: string
}

// ─── Parsed source documents ─────────────────────────────────────────────────
export interface MamanRow {
  index: number          // position in the CSV (0-based, after the header)
  code: string           // Item Code (can be blank)
  description: string
  packaging: string
  rawQuantity: string
  quantity: number | null  // null when not a valid number
}

export interface ParsedMaman {
  kind: 'maman'
  fileName: string
  accountAddress: string       // "Account Number" column = location address
  csvOrderDate: string         // as written in the CSV (kept for reference only)
  rows: MamanRow[]             // every row, including zero-quantity rows
  problems: Issue[]
}

export interface WestvilleLine {
  index: number
  item: string
  packSize: string
  vendorDescription: string
  vendorNumber: string
  quantity: number
  each: number
  total: number
}

export interface ParsedWestville {
  kind: 'westville'
  fileName: string
  poNumber: string | null
  location: string | null      // "Location : Westville West"
  accountNumber: string | null // Westville's account number for Newlight, not a store
  sendToAddress: string | null
  orderDate: string | null     // ISO
  deliveryDate: string | null  // ISO
  headerAmount: number | null  // "Amount" at the top
  statedTotal: number | null   // "Total" under the lines
  lines: WestvilleLine[]
  problems: Issue[]
}

export type ParsedPo = ParsedMaman | ParsedWestville

// ─── Preview (what the admin reviews) ────────────────────────────────────────
export type MappingStatus = 'confirmed' | 'unconfirmed' | 'unresolved' | 'manual'

export interface PreviewLine {
  sourceIndex: number
  sourceCode: string
  sourceDescription: string      // original text from the PO, always preserved
  sourceDetail: string           // extra source info (pack size, vendor number, ...)
  quantity: number | null
  productId: string | null
  productName: string
  mappingStatus: MappingStatus
  slicing: string
  slicingSource: 'source' | 'mapping' | 'customer-default' | 'none' | 'manual'
  oneUnitPrice: number | null    // OMS customer price
  sourceUnitPrice: number | null // price on the PO (Westville only)
  lineTotal: number | null       // OMS price x quantity
  issues: Issue[]
}

export interface PreviewCustomerInfo {
  id: string
  name: string
  address: string
  active: boolean
}

export interface PreviewOrder {
  fileName: string
  kind: 'maman' | 'westville'
  sourceLocation: string               // text from the file that identifies the location
  expectedCustomerName: string | null  // from the location mapping
  customer: PreviewCustomerInfo | null
  customerCandidates: PreviewCustomerInfo[]
  customerIsManual: boolean
  deliveryDate: string | null
  deliveryDateNote: string
  poNumber: string | null
  lines: PreviewLine[]                 // nonzero lines only
  zeroRows: { description: string; code: string }[]  // kept for reference, not ordered
  issues: Issue[]                      // order-level issues
  proposedTotal: number                // OMS prices x quantities
  sourceTotal: number | null           // Westville stated total
}

export interface PreviewInput {
  receivedDate?: string        // Maman: YYYY-MM-DD, New York calendar date
  overrideDate?: string        // explicit delivery date (e.g. stated in the email)
  dateConfirmed?: boolean      // admin confirmed the final delivery date
  customerIdOverride?: string  // manual customer pick (local only)
  lineOverrides?: Record<number, { productId?: string; slicing?: string }>
  today?: string               // YYYY-MM-DD, for tests
}
