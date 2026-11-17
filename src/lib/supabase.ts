import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  console.warn('HM Mobile POS: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set. Set them in .env (Vercel: Project Settings > Environment Variables).')
}

// Publishable (anon) key only — safe in the browser. Never use a
// secret / service-role key or DB password in frontend code.
export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const SHOP = {
  name: 'HM MOBILE',
  fullName: 'HM Mobile Repairing Lab and Training Center',
  address: 'City Thana Road, Rajoa Chowk, Chiniot',
  phone: '03461412334',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
}

export type Role = 'admin' | 'cashier' | 'technician'

export interface Product {
  id: string; name: string; sku: string; barcode: string | null
  category_id: string | null; brand: string | null
  purchase_price: number; avg_cost: number; selling_price: number
  wholesale_price: number; quantity: number; min_stock: number
  supplier_id: string | null; status: string; created_at: string
}
export interface Category { id: string; name: string }
export interface Supplier { id: string; name: string; phone: string; address: string | null; opening_balance: number }
export interface Customer { id: string; name: string; phone: string; address: string | null; opening_balance: number; is_walkin: boolean }
export interface Sale { id: string; invoice_no: string; customer_id: string | null; sale_date: string; subtotal: number; discount: number; grand_total: number; paid: number; balance: number; payment_method: string; status: string }
export interface SaleItem { id: string; sale_id: string; product_id: string; quantity: number; unit_price: number; unit_cost: number; discount: number; line_total: number }
export interface Purchase { id: string; invoice_no: string; supplier_id: string; purchase_date: string; subtotal: number; discount: number; extra_charges: number; grand_total: number; paid: number; balance: number; payment_method: string; status: string; notes: string | null }
export interface PurchaseItem { id: string; purchase_id: string; product_id: string; quantity: number; rate: number; line_total: number; selling_price: number | null }
export interface Repair { id: string; job_no: string; customer_id: string | null; customer_name: string; customer_phone: string; brand: string | null; model: string | null; imei: string | null; device_color: string | null; problem: string; device_condition: string | null; accessories_received: string | null; technician_id: string | null; status: string; estimated_cost: number; advance: number; labour_charges: number; final_charges: number; warranty_days: number; notes: string | null; received_at: string; delivered_at: string | null }
export interface RepairPart { id: string; repair_id: string; product_id: string; quantity: number; unit_cost: number; unit_price: number }
export interface Expense { id: string; expense_date: string; category_id: string | null; description: string; amount: number; payment_method: string; notes: string | null }
export interface ExpenseCategory { id: string; name: string }
export interface CashbookRow { id: string; entry_date: string; type: 'in' | 'out'; amount: number; source: string; reference_id: string | null; description: string | null }
export interface StockMovement { id: string; product_id: string; move_type: string; quantity: number; balance_after: number; unit_cost: number | null; reference_type: string | null; created_at: string }
export interface ReturnRow { id: string; return_type: string; original_sale_id: string | null; return_date: string; total: number; status: string; notes: string | null }

export const fmt = (n: number | null | undefined) =>
  'Rs ' + (Number(n ?? 0)).toLocaleString('en-PK', { maximumFractionDigits: 2 })

export const todayPK = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: SHOP.timezone }))
  return d.toISOString().slice(0, 10)
}

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`

/** Role for the signed-in user: users table first, then email prefix fallback. */
export async function resolveRole(email: string, authId: string): Promise<Role> {
  const { data } = await supabase.from('users').select('role').eq('auth_id', authId).maybeSingle()
  if (data?.role) return data.role as Role
  const { data: byEmail } = await supabase.from('users').select('role').eq('email', email).maybeSingle()
  if (byEmail?.role) return byEmail.role as Role
  if (email.startsWith('admin@')) return 'admin'
  if (email.startsWith('tech@')) return 'technician'
  return 'cashier'
}
