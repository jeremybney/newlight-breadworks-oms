// FreshBooks API integration
// Credentials stored as environment variables, never in code

const FB_CLIENT_ID     = process.env.FRESHBOOKS_CLIENT_ID!
const FB_CLIENT_SECRET = process.env.FRESHBOOKS_CLIENT_SECRET!
const FB_ACCOUNT_ID_RAW = process.env.FRESHBOOKS_ACCOUNT_ID!
// FreshBooks API uses the short account ID (e.g. "pJxxkW") - strip the numeric suffix if present
const FB_ACCOUNT_ID = FB_ACCOUNT_ID_RAW?.includes('-') ? FB_ACCOUNT_ID_RAW.split('-')[0] : FB_ACCOUNT_ID_RAW
const FB_REDIRECT_URI  = process.env.FRESHBOOKS_REDIRECT_URI!
const FB_API_BASE      = 'https://api.freshbooks.com'
const FB_AUTH_URL      = 'https://auth.freshbooks.com/oauth/authorize'
const FB_TOKEN_URL     = 'https://api.freshbooks.com/auth/oauth/token'

export interface FreshBooksTokens {
  access_token: string
  refresh_token: string
  expires_at: number // unix timestamp ms
}

// ─── AUTH URL ────────────────────────────────────────────────────────────────
export function getFreshBooksAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: FB_CLIENT_ID,
    response_type: 'code',
    redirect_uri: FB_REDIRECT_URI,
    scope: 'user:profile:read user:clients:read user:clients:write user:invoices:read user:invoices:write',
  })
  return `${FB_AUTH_URL}?${params.toString()}`
}

// ─── EXCHANGE CODE FOR TOKENS ────────────────────────────────────────────────
export async function exchangeCodeForTokens(code: string): Promise<FreshBooksTokens> {
  const res = await fetch(FB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: FB_CLIENT_ID,
      client_secret: FB_CLIENT_SECRET,
      code,
      redirect_uri: FB_REDIRECT_URI,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }
  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
  }
}

// ─── REFRESH TOKENS ───────────────────────────────────────────────────────────
export async function refreshTokens(refresh_token: string): Promise<FreshBooksTokens> {
  const res = await fetch(FB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: FB_CLIENT_ID,
      client_secret: FB_CLIENT_SECRET,
      refresh_token,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token refresh failed: ${err}`)
  }
  const data = await res.json()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
  }
}

// ─── FIND OR CREATE CLIENT ────────────────────────────────────────────────────
export async function findOrCreateClient(
  accessToken: string,
  customerName: string,
  email?: string
): Promise<string> {
  // Search for existing client
  const searchRes = await fetch(
    `${FB_API_BASE}/accounting/account/${FB_ACCOUNT_ID}/users/clients?search[name]=${encodeURIComponent(customerName)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, 'Api-Version': 'alpha' } }
  )
  if (searchRes.ok) {
    const searchData = await searchRes.json()
    const clients = searchData?.response?.result?.clients || []
    if (clients.length > 0) {
      return String(clients[0].id)
    }
  }

  // Create new client
  const createRes = await fetch(
    `${FB_API_BASE}/accounting/account/${FB_ACCOUNT_ID}/users/clients`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Api-Version': 'alpha',
      },
      body: JSON.stringify({
        client: {
          organization: customerName,
          email: email || '',
        },
      }),
    }
  )
  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Failed to create client: ${err}`)
  }
  const createData = await createRes.json()
  return String(createData.response.result.client.id)
}

// ─── CREATE INVOICE ───────────────────────────────────────────────────────────
export interface InvoiceLineItem {
  name: string
  quantity: number
  unit_cost: number
  slicing?: string
}

export async function createInvoice(
  accessToken: string,
  params: {
    clientId: string
    orderId: string
    deliveryDate: string  // yyyy-mm-dd
    customerName: string
    items: InvoiceLineItem[]
    notes?: string
  }
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  // Due date = delivery date + 30 days
  const delivery = new Date(params.deliveryDate)
  delivery.setDate(delivery.getDate() + 30)
  const dueDate = delivery.toISOString().split('T')[0]

  const lines = params.items.map(item => ({
    type: 0,
    name: item.slicing ? `${item.name} (${item.slicing})` : item.name,
    qty: item.quantity,
    unit_cost: { amount: item.unit_cost.toFixed(2), code: 'USD' },
    tax_amount1: '0',
    tax_amount2: '0',
  }))

  const invoiceBody = {
    invoice: {
      customerid: params.clientId,
      create_date: new Date().toISOString().split('T')[0],
      due_offset_days: 30,
      notes: `NLB-${params.orderId}`,
      terms: 'Net 30 — due 30 days from delivery date',
      currency_code: 'USD',
      lines,
    },
  }

  const res = await fetch(
    `${FB_API_BASE}/accounting/account/${FB_ACCOUNT_ID}/invoices/invoices`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Api-Version': 'alpha',
      },
      body: JSON.stringify(invoiceBody),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create invoice: ${err}`)
  }

  const data = await res.json()
  const invoice = data.response.result.invoice
  return {
    invoiceId: String(invoice.id),
    invoiceNumber: invoice.invoice_number,
  }
}
