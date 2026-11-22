import { supabase, uid, type Category, type Customer, type Product, type Purchase, type PurchaseItem, type Repair, type Sale, type Supplier } from './supabase'

export interface AllData {
  products: Product[]; categories: Category[]; suppliers: Supplier[]; customers: Customer[]
  sales: Sale[]; purchases: Purchase[]; repairs: Repair[]
  saleItems: any[]; purchaseItems: PurchaseItem[]; repairParts: any[]
  expenses: any[]; expenseCategories: any[]; cashbook: any[]
  movements: any[]; returns: any[]
}

export async function fetchAll(): Promise<AllData> {
  const q = async (table: string, order = 'created_at') => {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false }).limit(2000)
    if (error) throw new Error(`${table}: ${error.message}`)
    return data ?? []
  }
  const [products, categories, suppliers, customers, sales, purchases, repairs, saleItems, purchaseItems, repairParts, expenses, expenseCategories, cashbook, movements, returns] = await Promise.all([
    q('products'), q('categories', 'name'), q('suppliers'), q('customers'), q('sales', 'sale_date'),
    q('purchases', 'purchase_date'), q('repairs', 'received_at'), q('sale_items'), q('purchase_items'),
    q('repair_parts'), q('expenses', 'expense_date'), q('expense_categories', 'name'),
    q('cashbook', 'entry_date'), q('stock_movements'), q('returns', 'return_date'),
  ])
  return { products, categories, suppliers, customers, sales, purchases, repairs, saleItems, purchaseItems, repairParts, expenses, expenseCategories, cashbook, movements, returns }
}

export const catName = (d: AllData, id: string | null) =>
  d.categories.find(c => c.id === id)?.name ?? '—'
export const prodName = (d: AllData, id: string) =>
  d.products.find(p => p.id === id)?.name ?? '—'

async function moveStock(productId: string, qty: number, moveType: string, unitCost: number | null, refType: string, refId: string | null) {
  const { data: p } = await supabase.from('products').select('quantity').eq('id', productId).single()
  const after = Number(p?.quantity ?? 0) + qty
  const { error } = await supabase.from('stock_movements').insert({ product_id: productId, move_type: moveType, quantity: qty, balance_after: after, unit_cost: unitCost, reference_type: refType, reference_id: refId })
  if (error) throw new Error(error.message)
  return after
}

async function setQty(productId: string, qty: number) {
  const { error } = await supabase.from('products').update({ quantity: qty }).eq('id', productId)
  if (error) throw new Error(error.message)
}

/** Stock entry: new product or add qty. sale = cost + profit%. Cost is only used here — never shown in lists. */
export async function addStock(input: { productId?: string | null; name: string; sku?: string; categoryId: string | null; brand?: string; qty: number; cost: number; profitPercent: number; salePriceOverride?: number; minStock?: number }) {
  const salePrice = input.salePriceOverride ?? Math.round((input.cost * (1 + input.profitPercent / 100)) * 100) / 100
  let productId = input.productId ?? null
  if (!productId) {
    const { data, error } = await supabase.from('products').insert({
      name: input.name, sku: input.sku || uid('SKU'), category_id: input.categoryId,
      brand: input.brand || null, purchase_price: input.cost, avg_cost: input.cost,
      selling_price: salePrice, wholesale_price: salePrice, quantity: input.qty, min_stock: input.minStock ?? 5,
    }).select().single()
    if (error) throw new Error(error.message)
    productId = data.id
    await moveStock(productId, input.qty, 'opening', input.cost, 'stock_entry', null)
    return { productId, salePrice, isNew: true }
  }
  const { data: p } = await supabase.from('products').select('quantity,avg_cost').eq('id', productId).single()
  const oldQty = Number(p?.quantity ?? 0), oldAvg = Number(p?.avg_cost ?? 0)
  const newAvg = oldQty + input.qty > 0 ? (oldQty * oldAvg + input.qty * input.cost) / (oldQty + input.qty) : input.cost
  const { error } = await supabase.from('products').update({ quantity: oldQty + input.qty, avg_cost: newAvg, purchase_price: input.cost, selling_price: salePrice, wholesale_price: salePrice }).eq('id', productId)
  if (error) throw new Error(error.message)
  await moveStock(productId, input.qty, 'purchase', input.cost, 'stock_entry', null)
  return { productId, salePrice, isNew: false }
}

export async function adjustStock(productId: string, delta: number, reason: string, allowNegative: boolean) {
  const { data: p } = await supabase.from('products').select('quantity').eq('id', productId).single()
  const after = Number(p?.quantity ?? 0) + delta
  if (after < 0 && !allowNegative) throw new Error('Stock would go negative. Admin override required.')
  await setQty(productId, after)
  await moveStock(productId, delta, 'adjustment', null, 'adjustment', null)
  return after
}

/** Edit a product's name, brand, category, sale price and low-stock level. Cost is never changed here. */
export async function updateProduct(input: { id: string; name: string; brand?: string; categoryId: string | null; sellingPrice: number; minStock: number }) {
  const { error } = await supabase.from('products').update({
    name: input.name, brand: input.brand || null, category_id: input.categoryId,
    selling_price: input.sellingPrice, wholesale_price: input.sellingPrice,
    min_stock: input.minStock, updated_at: new Date().toISOString(),
  }).eq('id', input.id)
  if (error) throw new Error(error.message)
}

/**
 * Delete a product. If it has any sale, purchase, repair-part or serial history it is
 * deactivated instead (status='inactive') so old invoices and reports stay correct.
 * Returns 'deleted' or 'deactivated'.
 */
export async function deleteProduct(productId: string): Promise<'deleted' | 'deactivated'> {
  const checks = await Promise.all([
    supabase.from('sale_items').select('id', { count: 'exact', head: true }).eq('product_id', productId),
    supabase.from('purchase_items').select('id', { count: 'exact', head: true }).eq('product_id', productId),
    supabase.from('repair_parts').select('id', { count: 'exact', head: true }).eq('product_id', productId),
    supabase.from('product_serials').select('id', { count: 'exact', head: true }).eq('product_id', productId),
  ])
  const linked = checks.reduce((s, r) => s + (r.count ?? 0), 0)
  if (linked === 0) {
    await supabase.from('stock_movements').delete().eq('product_id', productId)
    const { error } = await supabase.from('products').delete().eq('id', productId)
    if (error) throw new Error(error.message)
    return 'deleted'
  }
  const { error } = await supabase.from('products').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('id', productId)
  if (error) throw new Error(error.message)
  return 'deactivated'
}

export interface CartLine { product: Product; qty: number; price: number; lineDiscount: number }

/** Complete a POS sale: stock decreases, sale + items, cashbook in for paid amount. */
export async function completeSale(input: { customerId: string | null; lines: CartLine[]; discount: number; paid: number; paymentMethod: string; allowNegative: boolean }) {
  for (const l of input.lines) {
    if (Number(l.product.quantity) - l.qty < 0 && !input.allowNegative) throw new Error(`Not enough stock for ${l.product.name}`)
  }
  const subtotal = input.lines.reduce((s, l) => s + l.qty * l.price - (l.lineDiscount || 0), 0)
  const grandTotal = Math.max(0, subtotal - input.discount)
  const invoiceNo = uid('SALE')
  const { data: sale, error } = await supabase.from('sales').insert({
    invoice_no: invoiceNo, customer_id: input.customerId, subtotal, discount: input.discount,
    grand_total: grandTotal, paid: input.paid, balance: grandTotal - input.paid,
    payment_method: input.paymentMethod.toLowerCase(), status: 'confirmed',
  }).select().single()
  if (error) throw new Error(error.message)
  for (const l of input.lines) {
    const lineTotal = l.qty * l.price - (l.lineDiscount || 0)
    await supabase.from('sale_items').insert({ sale_id: sale.id, product_id: l.product.id, quantity: l.qty, unit_price: l.price, unit_cost: l.product.avg_cost, discount: l.lineDiscount || 0, line_total: lineTotal })
    const after = Number(l.product.quantity) - l.qty
    await setQty(l.product.id, after)
    await moveStock(l.product.id, -l.qty, 'sale', l.product.avg_cost, 'sale', sale.id)
  }
  if (input.paid > 0) {
    await supabase.from('cashbook').insert({ type: 'in', amount: input.paid, source: 'sale', reference_id: sale.id, description: `Sale ${invoiceNo}` })
  }
  if (input.customerId && grandTotal - input.paid > 0) {
    const { data: c } = await supabase.from('customers').select('opening_balance').eq('id', input.customerId).single()
    await supabase.from('customers').update({ opening_balance: Number(c?.opening_balance ?? 0) + (grandTotal - input.paid) }).eq('id', input.customerId)
  }
  return { sale, invoiceNo, grandTotal }
}

/** Sales return: restores stock, linked reversal; original sale is never edited. */
export async function createSaleReturn(saleId: string, invoiceNo: string, items: { productId: string; qty: number; unitPrice: number }[], reason: string, refund: number) {
  const { data: ret, error } = await supabase.from('returns').insert({ return_type: 'customer', original_sale_id: saleId, total: refund, status: 'confirmed', notes: reason }).select().single()
  if (error) throw new Error(error.message)
  for (const it of items) {
    await supabase.from('return_items').insert({ return_id: ret.id, product_id: it.productId, quantity: it.qty, unit_price: it.unitPrice })
    const { data: p } = await supabase.from('products').select('quantity').eq('id', it.productId).single()
    const after = Number(p?.quantity ?? 0) + it.qty
    await setQty(it.productId, after)
    await moveStock(it.productId, it.qty, 'sale_return', null, 'return', ret.id)
  }
  if (refund > 0) await supabase.from('cashbook').insert({ type: 'out', amount: refund, source: 'sale_return', reference_id: ret.id, description: `Return for ${invoiceNo}` })
  return ret
}

/** Purchase: draft stores only; confirm increases stock (weighted avg cost) + supplier balance. */
export async function savePurchase(input: { id?: string; invoiceNo: string; supplierId: string; date: string; discount: number; extraCharges: number; paid: number; paymentMethod: string; notes: string; status: 'draft' | 'confirmed'; lines: { productId: string; qty: number; rate: number; salePrice: number }[] }, applyStock: boolean) {
  const subtotal = input.lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const grandTotal = subtotal - input.discount + input.extraCharges
  let purchaseId = input.id
  if (!purchaseId) {
    const { data, error } = await supabase.from('purchases').insert({
      invoice_no: input.invoiceNo, supplier_id: input.supplierId, purchase_date: input.date,
      subtotal, discount: input.discount, extra_charges: input.extraCharges, grand_total: grandTotal,
      paid: input.paid, balance: grandTotal - input.paid, payment_method: input.paymentMethod.toLowerCase(),
      status: input.status, notes: input.notes || null,
    }).select().single()
    if (error) throw new Error(error.message)
    purchaseId = data.id
  } else {
    const { error } = await supabase.from('purchases').update({ invoice_no: input.invoiceNo, supplier_id: input.supplierId, purchase_date: input.date, subtotal, discount: input.discount, extra_charges: input.extraCharges, grand_total: grandTotal, paid: input.paid, balance: grandTotal - input.paid, payment_method: input.paymentMethod.toLowerCase(), status: input.status, notes: input.notes || null }).eq('id', purchaseId)
    if (error) throw new Error(error.message)
    await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId)
  }
  for (const l of input.lines) {
    await supabase.from('purchase_items').insert({ purchase_id: purchaseId, product_id: l.productId, quantity: l.qty, rate: l.rate, line_total: l.qty * l.rate, selling_price: l.salePrice })
  }
  if (applyStock && input.status === 'confirmed') {
    for (const l of input.lines) {
      const { data: p } = await supabase.from('products').select('quantity,avg_cost').eq('id', l.productId).single()
      const oldQty = Number(p?.quantity ?? 0), oldAvg = Number(p?.avg_cost ?? 0)
      const newAvg = oldQty + l.qty > 0 ? (oldQty * oldAvg + l.qty * l.rate) / (oldQty + l.qty) : l.rate
      await supabase.from('products').update({ quantity: oldQty + l.qty, avg_cost: newAvg, purchase_price: l.rate, selling_price: l.salePrice, wholesale_price: l.salePrice }).eq('id', l.productId)
      await moveStock(l.productId, l.qty, 'purchase', l.rate, 'purchase', purchaseId)
    }
    const unpaid = grandTotal - input.paid
    if (unpaid > 0) {
      const { data: s } = await supabase.from('suppliers').select('opening_balance').eq('id', input.supplierId).single()
      await supabase.from('suppliers').update({ opening_balance: Number(s?.opening_balance ?? 0) + unpaid }).eq('id', input.supplierId)
    }
    if (input.paid > 0) await supabase.from('cashbook').insert({ type: 'out', amount: input.paid, source: 'purchase', reference_id: purchaseId, description: `Purchase ${input.invoiceNo}` })
  }
  return purchaseId
}

export async function saveRepair(input: { id?: string; jobNo: string; customerName: string; customerPhone: string; brand: string; model: string; imei: string; deviceColor: string; problem: string; deviceCondition: string; accessories: string; status: string; estimatedCost: number; advance: number; labour: number; finalCharges: number; warrantyDays: number; notes: string; parts: { product: Product; qty: number }[] }, isNew: boolean) {
  let repairId = input.id
  const row: any = {
    job_no: input.jobNo, customer_name: input.customerName, customer_phone: input.customerPhone,
    brand: input.brand || null, model: input.model || null, imei: input.imei || null,
    device_color: input.deviceColor || null, problem: input.problem, device_condition: input.deviceCondition || null,
    accessories_received: input.accessories || null, status: input.status, estimated_cost: input.estimatedCost,
    advance: input.advance, labour_charges: input.labour, final_charges: input.finalCharges,
    warranty_days: input.warrantyDays, notes: input.notes || null,
  }
  if (!repairId) {
    const { data, error } = await supabase.from('repairs').insert(row).select().single()
    if (error) throw new Error(error.message)
    repairId = data.id
  } else {
    const { error } = await supabase.from('repairs').update(row).eq('id', repairId)
    if (error) throw new Error(error.message)
  }
  if (isNew) {
    for (const part of input.parts) {
      await supabase.from('repair_parts').insert({ repair_id: repairId, product_id: part.product.id, quantity: part.qty, unit_cost: part.product.avg_cost, unit_price: part.product.selling_price })
      const after = Number(part.product.quantity) - part.qty
      await setQty(part.product.id, after)
      await moveStock(part.product.id, -part.qty, 'repair_use', part.product.avg_cost, 'repair', repairId)
    }
    if (input.advance > 0) await supabase.from('cashbook').insert({ type: 'in', amount: input.advance, source: 'repair', reference_id: repairId, description: `Repair advance ${input.jobNo}` })
  }
  return repairId
}

export async function recordPayment(party: 'customer' | 'supplier', partyId: string, amount: number, method: string, notes: string) {
  const table = party === 'customer' ? 'customers' : 'suppliers'
  const { data } = await supabase.from(table).select('opening_balance').eq('id', partyId).single()
  await supabase.from(table).update({ opening_balance: Math.max(0, Number(data?.opening_balance ?? 0) - amount) }).eq('id', partyId)
  await supabase.from('payments').insert({ linked_type: party, linked_id: partyId, direction: party === 'customer' ? 'in' : 'out', amount, payment_method: method.toLowerCase(), notes: notes || null })
  await supabase.from('cashbook').insert({ type: party === 'customer' ? 'in' : 'out', amount, source: party === 'customer' ? 'customer_payment' : 'supplier_payment', reference_id: partyId, description: notes || `${party} payment` })
}

export async function addExpense(input: { categoryId: string | null; description: string; amount: number; date: string; method: string }) {
  const { data, error } = await supabase.from('expenses').insert({ category_id: input.categoryId, description: input.description, amount: input.amount, expense_date: input.date, payment_method: input.method.toLowerCase() }).select().single()
  if (error) throw new Error(error.message)
  await supabase.from('cashbook').insert({ type: 'out', amount: input.amount, source: 'expense', reference_id: data.id, description: input.description })
}
