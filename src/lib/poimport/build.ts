// Turns a parsed PO into an OMS-compatible order PREVIEW. Pure and read-only:
// it takes the live customers/products as input and returns data to display.
// It never creates orders, invoices, or any other record.
import { Customer, Product } from '@/types'
import {
  Issue, MappingStatus, ParsedMaman, ParsedPo, ParsedWestville, PreviewCustomerInfo,
  PreviewInput, PreviewLine, PreviewOrder,
} from './types'
import {
  MAMAN_LOCATIONS, MAMAN_PRODUCTS, ProductMapping, WESTVILLE_LOCATIONS, WESTVILLE_PRODUCTS,
  normAddress, normText, westvilleDerivedName,
} from './mappings'
import { isValidIso, mamanDeliveryDate, weekdayName } from './maman'

export const SLICING_OPTIONS = ['', 'Sliced', 'TH Sliced', '1" Sliced', 'No Slice']

const issue = (severity: Issue['severity'], code: string, message: string): Issue => ({ severity, code, message })
const info = (c: Customer): PreviewCustomerInfo => ({ id: c.id, name: c.name, address: c.address || '', active: c.active !== false })
const money = (n: number) => `$${n.toFixed(2)}`

// ─── Customer matching (by live customer record, never by guessing) ──────────
function findCustomers(customers: Customer[], expectedName: string): Customer[] {
  const want = normText(expectedName)
  return customers.filter(c => normText(c.name || '') === want)
}

// Compares street number (and ZIP when both have one). Used only to raise a warning.
function addressCheck(po: string | null | undefined, cust: string): 'match' | 'mismatch' | 'unknown' {
  const num = (x: string) => x.trim().match(/^(\d+(?:-\d+)?[a-z]?)\b/i)?.[1]?.toLowerCase()
  const zip = (x: string) => x.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1]
  if (!po || !cust) return 'unknown'
  const a = num(po), b = num(cust)
  if (!a || !b) return 'unknown'
  if (a !== b) return 'mismatch'
  const za = zip(po), zb = zip(cust)
  if (za && zb && za !== zb) return 'mismatch'
  return 'match'
}

// ─── Product mapping lookup ──────────────────────────────────────────────────
function findMapping(
  table: ProductMapping[], code: string, description: string,
): { mapping: ProductMapping | null; conflict: boolean } {
  const c = code.trim().toUpperCase()
  const d = normText(description)
  const byCode = c ? table.find(m => m.codes.includes(c)) : undefined
  const byDesc = table.find(m => m.descriptions.includes(d))
  if (byCode && byDesc && byCode !== byDesc) return { mapping: null, conflict: true }
  return { mapping: byCode || byDesc || null, conflict: false }
}

interface RawLine {
  sourceIndex: number
  code: string
  description: string
  detail: string
  quantity: number | null
  mappingKey: { code: string; description: string }
  sourceUnitPrice: number | null
  sourceSlicing: string | null // slicing stated by the source document itself; null = none stated
}

export function buildPreview(
  parsed: ParsedPo,
  ctx: { customers: Customer[]; products: Product[] },
  input: PreviewInput = {},
): PreviewOrder {
  const issues: Issue[] = [...parsed.problems]
  const isMaman = parsed.kind === 'maman'
  const today = input.today || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // ── 1. Location -> expected customer name ──
  let sourceLocation = ''
  let expectedName: string | null = null
  if (isMaman) {
    const p = parsed as ParsedMaman
    const subjectName = p.email?.subjectLocation || null
    sourceLocation = [p.accountAddress, subjectName && `(email subject: ${subjectName})`].filter(Boolean).join(' ')
    const addr = normAddress(p.accountAddress)
    const hits = MAMAN_LOCATIONS.filter(l => addr.startsWith(l.addressKey))
    const addressName = hits.length === 1 ? hits[0].customerName : null
    if (hits.length > 1) {
      issues.push(issue('blocking', 'location-ambiguous', `The address "${p.accountAddress}" matches more than one Maman location (${hits.map(h => h.customerName).join(', ')}).`))
    } else if (subjectName && addressName && normText(subjectName) !== normText(addressName)) {
      issues.push(issue('blocking', 'location-conflict', `The email subject says "${subjectName}" but the CSV address belongs to "${addressName}". Check which location this is.`))
    } else {
      expectedName = subjectName || addressName
      if (!expectedName && p.accountAddress) issues.push(issue('blocking', 'location-unknown', `The address "${p.accountAddress}" is not in the Maman location mapping. Use the order email, whose subject names the location.`))
    }
  } else {
    const p = parsed as ParsedWestville
    sourceLocation = [p.location, p.sendToAddress].filter(Boolean).join(' · ')
    const loc = normText(p.location || '')
    const hit = WESTVILLE_LOCATIONS.find(l => l.location === loc)
    if (hit) expectedName = hit.customerName
    else if (p.location) {
      expectedName = westvilleDerivedName(p.location)
      if (expectedName) issues.push(issue('info', 'location-derived', `"${p.location}" was matched to "${expectedName}" by name.`))
      else issues.push(issue('blocking', 'location-unknown', `The location "${p.location}" is not in the Westville location mapping.`))
    }
  }

  // ── 2. Customer record in the live database ──
  let customer: Customer | null = null
  let candidates: Customer[] = []
  const manual = !!input.customerIdOverride
  if (manual) {
    customer = ctx.customers.find(c => c.id === input.customerIdOverride) || null
    if (customer) issues.push(issue('warning', 'customer-manual', `Customer was picked by hand (${customer.name}). This is a preview-only choice; nothing is saved.`))
  } else if (expectedName) {
    candidates = findCustomers(ctx.customers, expectedName)
    if (candidates.length === 1) customer = candidates[0]
    else if (candidates.length === 0) issues.push(issue('blocking', 'customer-missing', `No customer named "${expectedName}" exists in the database. Pick one below or check the customer list.`))
    else issues.push(issue('blocking', 'customer-ambiguous', `${candidates.length} customers are named "${expectedName}". Pick the right one below.`))
  }
  if (customer && customer.active === false) issues.push(issue('blocking', 'customer-inactive', `${customer.name} is marked inactive.`))
  if (customer && !manual) {
    const poAddress = isMaman ? (parsed as ParsedMaman).accountAddress : (parsed as ParsedWestville).sendToAddress
    if (addressCheck(poAddress, customer.address || '') === 'mismatch') {
      issues.push(issue('warning', 'address-mismatch', `The address on the order (${poAddress}) does not match the address on ${customer.name} (${customer.address}). Check that this is the right location, or update the customer record.`))
    }
  }

  // ── 3. Delivery date ──
  let deliveryDate: string | null = null
  let dateNote = ''
  if (isMaman) {
    if (input.overrideDate) {
      if (isValidIso(input.overrideDate)) { deliveryDate = input.overrideDate; dateNote = `Override date (${weekdayName(deliveryDate)}).` }
      else issues.push(issue('blocking', 'date-invalid', 'The override delivery date is not a valid date.'))
    }
    if (!deliveryDate) {
      if (!input.receivedDate) {
        issues.push(issue('blocking', 'received-missing', 'Enter the date the email was received (New York time) so the delivery date can be calculated.'))
      } else if (!isValidIso(input.receivedDate)) {
        issues.push(issue('blocking', 'received-invalid', 'The email received date is not a valid date.'))
      } else {
        deliveryDate = mamanDeliveryDate(input.receivedDate)
        dateNote = `Rule: received ${weekdayName(input.receivedDate)} -> deliver ${weekdayName(deliveryDate)}.`
      }
    }
    if (deliveryDate && !input.dateConfirmed) issues.push(issue('blocking', 'date-unconfirmed', 'Confirm the final delivery date (checkbox) before this order can be treated as ready.'))
    const csvDate = (parsed as ParsedMaman).csvOrderDate
    if (input.receivedDate && csvDate && csvDate !== input.receivedDate) {
      issues.push(issue('info', 'csv-date-differs', `CSV Order Date (${csvDate}) differs from the email received date (${input.receivedDate}). The received date is used.`))
    }
  } else {
    const p = parsed as ParsedWestville
    deliveryDate = p.deliveryDate
    dateNote = 'Delivery Date printed on the PO.'
    if (input.overrideDate && isValidIso(input.overrideDate)) { deliveryDate = input.overrideDate; dateNote = 'Override date.' }
  }
  if (deliveryDate && deliveryDate < today) issues.push(issue('warning', 'date-past', `Delivery date ${deliveryDate} is in the past.`))

  // ── 4. Lines ──
  const raw: RawLine[] = isMaman
    ? (parsed as ParsedMaman).rows.map(r => {
        const sliceMatch = r.description.match(/\(([^()]*sliced[^()]*)\)\s*$/i)
        return {
          sourceIndex: r.index, code: r.code, description: r.description,
          detail: r.packaging ? `Packaging: ${r.packaging}` : '', quantity: r.quantity,
          mappingKey: { code: r.code, description: r.description }, sourceUnitPrice: null,
          sourceSlicing: sliceMatch && /th sliced/i.test(sliceMatch[1]) ? 'TH Sliced' : null,
        }
      })
    : (parsed as ParsedWestville).lines.map(l => ({
        sourceIndex: l.index, code: l.vendorNumber, description: `${l.item} → ${l.vendorDescription}`,
        detail: [l.packSize && `Pack: ${l.packSize}`, `PO price ${money(l.each)}`].filter(Boolean).join(' · '),
        quantity: l.quantity, mappingKey: { code: '', description: l.vendorDescription },
        sourceUnitPrice: l.each, sourceSlicing: null,
      }))

  const table = isMaman ? MAMAN_PRODUCTS : WESTVILLE_PRODUCTS
  const productById = new Map(ctx.products.map(p => [p.id, p]))
  const lines: PreviewLine[] = []
  const zeroRows: { description: string; code: string }[] = []

  for (const r of raw) {
    // Quantity check first. Zero rows are kept in the source data but not ordered.
    if (r.quantity !== null && r.quantity === 0) { zeroRows.push({ description: r.description, code: r.code }); continue }
    const lineIssues: Issue[] = []
    if (r.quantity === null || !Number.isFinite(r.quantity) || r.quantity < 0 || !Number.isInteger(r.quantity)) {
      lineIssues.push(issue('blocking', 'qty-invalid', `Quantity "${r.quantity}" is not a whole number of 1 or more.`))
    }

    // Mapping (or a manual product pick made in the preview)
    const ov = input.lineOverrides?.[r.sourceIndex]
    let productId: string | null = null
    let status: MappingStatus = 'unresolved'
    let mappedSlicing: string | null = null
    const { mapping, conflict } = findMapping(table, r.mappingKey.code, r.mappingKey.description)
    if (ov?.productId) {
      productId = ov.productId
      status = 'manual'
      lineIssues.push(issue('warning', 'product-manual', 'Product was picked by hand. This is a preview-only choice; nothing is saved.'))
    } else if (conflict) {
      lineIssues.push(issue('blocking', 'mapping-conflict', 'The item code and the description point to different products. Pick the product below.'))
    } else if (mapping) {
      productId = mapping.productId
      mappedSlicing = mapping.slicing
      status = mapping.confirmed ? 'confirmed' : 'unconfirmed'
      if (!mapping.confirmed) lineIssues.push(issue('blocking', 'mapping-unconfirmed', mapping.note || 'This mapping has not been confirmed yet.'))
    } else {
      lineIssues.push(issue('blocking', 'product-unmapped', `No product mapping for "${r.mappingKey.description}"${r.code ? ` (code ${r.code})` : ''}. Pick the product below.`))
    }

    // Product record check (missing / inactive)
    const product = productId ? productById.get(productId) : undefined
    if (productId && !product) lineIssues.push(issue('blocking', 'product-missing', `Product "${productId}" does not exist in the product catalog.`))
    if (product && product.active === false) lineIssues.push(issue('blocking', 'product-inactive', `Product "${product.name}" is inactive.`))

    // Slicing: explicit source/mapping instruction wins; customer default only fills a gap.
    const custDefault = customer?.slicing?.[productId || ''] || ''
    let slicing = ''
    let slicingSource: PreviewLine['slicingSource'] = 'none'
    if (ov && ov.slicing !== undefined) { slicing = ov.slicing; slicingSource = 'manual' }
    else if (r.sourceSlicing) { slicing = r.sourceSlicing; slicingSource = 'source' }
    else if (isMaman && mapping) { slicing = mappedSlicing || ''; slicingSource = mapping.slicing ? 'mapping' : 'none' }
    else if (custDefault) { slicing = custDefault; slicingSource = 'customer-default' }
    if (isMaman && slicingSource !== 'manual' && productId && custDefault !== slicing && custDefault) {
      lineIssues.push(issue('warning', 'slicing-differs', `Customer default slicing is "${custDefault}" but the order uses "${slicing || 'none'}". The order's instruction was kept.`))
    }
    if (slicing && !SLICING_OPTIONS.includes(slicing)) lineIssues.push(issue('warning', 'slicing-unknown', `Slicing "${slicing}" is not one of the usual options.`))
    if (slicing && product && !product.canBeSliced) lineIssues.push(issue('warning', 'slicing-not-sliceable', `"${product.name}" is not marked sliceable, but slicing "${slicing}" is requested.`))
    if (!isMaman && !slicing && product?.canBeSliced) lineIssues.push(issue('info', 'no-slicing', 'No slicing on the PO and no customer default in the OMS.'))

    // Price: OMS customer price is the source of truth; the PO price is only compared.
    const omsPrice = customer && productId ? customer.pricing?.[productId] : undefined
    let oneUnitPrice: number | null = typeof omsPrice === 'number' && omsPrice > 0 ? omsPrice : null
    if (customer && productId && oneUnitPrice === null) {
      lineIssues.push(issue('blocking', 'price-missing', `No OMS price for this product on ${customer.name}.`))
    }
    if (oneUnitPrice !== null && r.sourceUnitPrice !== null && Math.round(oneUnitPrice * 100) !== Math.round(r.sourceUnitPrice * 100)) {
      lineIssues.push(issue('warning', 'price-differs', `PO price ${money(r.sourceUnitPrice)} differs from OMS price ${money(oneUnitPrice)}. The OMS price is shown; nothing was changed.`))
    }

    lines.push({
      sourceIndex: r.sourceIndex, sourceCode: r.code, sourceDescription: r.description, sourceDetail: r.detail,
      quantity: r.quantity, productId, productName: product?.name || (productId ? productId : ''),
      mappingStatus: status, slicing, slicingSource, oneUnitPrice, sourceUnitPrice: r.sourceUnitPrice,
      lineTotal: oneUnitPrice !== null && r.quantity ? Math.round(oneUnitPrice * r.quantity * 100) / 100 : null,
      issues: lineIssues,
    })
  }

  if (!lines.length) issues.push(issue('blocking', 'no-lines', 'The file has no lines with a quantity above zero.'))
  if (isMaman && !(parsed as ParsedMaman).email) issues.push(issue('info', 'po-from-email', 'Maman CSVs carry no PO number; drop in the order email (.eml) to read it from the email body.'))

  return {
    fileName: parsed.fileName,
    kind: parsed.kind,
    sourceLocation,
    expectedCustomerName: expectedName,
    customer: customer ? info(customer) : null,
    customerCandidates: candidates.map(info),
    customerIsManual: manual,
    deliveryDate,
    deliveryDateNote: dateNote,
    poNumber: isMaman ? ((parsed as ParsedMaman).email?.poNumber ?? null) : (parsed as ParsedWestville).poNumber,
    email: parsed.email ?? null,
    lines,
    zeroRows,
    issues,
    proposedTotal: Math.round(lines.reduce((s, l) => s + (l.lineTotal || 0), 0) * 100) / 100,
    sourceTotal: isMaman ? null : (parsed as ParsedWestville).statedTotal,
  }
}

export function allIssues(p: PreviewOrder): Issue[] {
  return [...p.issues, ...p.lines.flatMap(l => l.issues)]
}
export const blockingCount = (p: PreviewOrder) => allIssues(p).filter(i => i.severity === 'blocking').length
