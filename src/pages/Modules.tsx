import { useMemo, useState } from 'react'
import { supabase, SHOP, fmt, todayPK, uid, type Role } from '../lib/supabase'
import { addStock, adjustStock, updateProduct, deleteProduct, completeSale, createSaleReturn, savePurchase, saveRepair, recordPayment, addExpense, fetchAll, catName, prodName, type AllData, type CartLine } from '../lib/store'

const inputCls = 'border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 w-full'
const btnCls = 'bg-teal-700 text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-50'
const cardCls = 'bg-white dark:bg-gray-800 rounded-xl p-4'
const thCls = 'text-left text-xs text-gray-500 font-semibold py-2 px-2 border-b'

function Receipt({ title, lines, total, paid, extra }: { title: string; lines: { label: string; value: string }[]; total: string; paid?: string; extra?: string }) {
  return (
    <div id="receipt" className="bg-white text-black rounded-xl p-4 max-w-sm mx-auto text-sm">
      <div className="text-center font-black text-lg">{SHOP.name}</div>
      <div className="text-center text-xs">{SHOP.fullName}<br />{SHOP.address}<br />{SHOP.phone}</div>
      <hr className="my-2" />
      <div className="font-bold text-center">{title}</div>
      {lines.map((l, i) => <div key={i} className="flex justify-between py-0.5"><span>{l.label}</span><span>{l.value}</span></div>)}
      <hr className="my-2" />
      <div className="flex justify-between font-bold"><span>Total</span><span>{total}</span></div>
      {paid && <div className="flex justify-between"><span>Paid</span><span>{paid}</span></div>}
      {extra && <div className="text-xs mt-2">{extra}</div>}
      <div className="text-center text-xs mt-2">Thank you! — HM Mobile</div>
    </div>
  )
}

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = name; a.click()
}

// ---------- STOCK ----------
export function StockPage({ data, role, refresh }: { data: AllData; role: Role; refresh: () => void }) {
  const [q, setQ] = useState('')
  const [name, setName] = useState(''), [sku, setSku] = useState(''), [cat, setCat] = useState('')
  const [cost, setCost] = useState(''), [profit, setProfit] = useState('30'), [qty, setQty] = useState('1')
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [eName, setEName] = useState(''), [eBrand, setEBrand] = useState(''), [eCat, setECat] = useState('')
  const [ePrice, setEPrice] = useState(''), [eMin, setEMin] = useState('5')
  const salePrice = cost ? Math.round(Number(cost) * (1 + Number(profit || 0) / 100) * 100) / 100 : 0
  const searchable = (p: any) => [p.name, p.sku, p.barcode ?? '', p.brand ?? '', ((p as any).compatible_models ?? []).join(' ')].join(' ').toLowerCase()
  const filtered = data.products.filter(p => p.status !== 'inactive' && searchable(p).includes(q.toLowerCase()))
  const totalValue = data.products.reduce((s, p) => s + Number(p.quantity) * Number(p.selling_price), 0)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('')
    try { const r = await addStock({ name, sku: sku || undefined, categoryId: cat || null, qty: Number(qty), cost: Number(cost), profitPercent: Number(profit) }); setMsg(`Saved — sale price ${fmt(r.salePrice)} (cost + ${profit}%).`); setName(''); setSku(''); setCost(''); setQty('1'); await refresh() }
    catch (err: any) { setMsg('Error: ' + err.message) } finally { setBusy(false) }
  }
  const adjust = async (p: any, delta: number) => {
    try { await adjustStock(p.id, delta, 'manual', role === 'admin'); await refresh() } catch (err: any) { alert(err.message) }
  }
  const startEdit = (p: any) => {
    setEditId(p.id); setEName(p.name); setEBrand(p.brand ?? ''); setECat(p.category_id ?? '')
    setEPrice(String(p.selling_price)); setEMin(String(p.min_stock ?? 5))
  }
  const saveEdit = async () => {
    if (!editId || !eName.trim() || Number(ePrice) < 0) { setMsg('Please enter a valid name and sale price.'); return }
    setBusy(true); setMsg('')
    try {
      await updateProduct({ id: editId, name: eName.trim(), brand: eBrand.trim(), categoryId: eCat || null, sellingPrice: Number(ePrice), minStock: Number(eMin) || 0 })
      setMsg('Product updated.'); setEditId(null); await refresh()
    } catch (err: any) { setMsg('Error: ' + err.message) } finally { setBusy(false) }
  }
  const removeProduct = async (p: any) => {
    if (!window.confirm(`Delete "${p.name}"?\n\nIf this product has any sale, purchase or repair history, it will be hidden instead of deleted so old invoices stay correct.`)) return
    setBusy(true); setMsg('')
    try {
      const res = await deleteProduct(p.id)
      setMsg(res === 'deleted' ? `"${p.name}" deleted.` : `"${p.name}" has history, so it was hidden (deactivated) instead of deleted.`)
      await refresh()
    } catch (err: any) { setMsg('Error: ' + err.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className={cardCls}><div className="text-xs text-gray-500">Stock Value (sale price)</div><div className="text-lg font-bold">{fmt(totalValue)}</div></div>
        <div className={cardCls}><div className="text-xs text-gray-500">Low Stock</div><div className="text-lg font-bold">{data.products.filter(p => Number(p.quantity) <= Number(p.min_stock) && Number(p.quantity) > 0).length}</div></div>
        <div className={cardCls}><div className="text-xs text-gray-500">Out of Stock</div><div className="text-lg font-bold">{data.products.filter(p => Number(p.quantity) <= 0).length}</div></div>
      </div>
      <form onSubmit={submit} className={`${cardCls} space-y-2`}>
        <div className="font-semibold">Add Stock — cost + profit % auto-calculates sale price (cost is only visible here, never in lists)</div>
        <div className="grid md:grid-cols-3 gap-2">
          <input className={inputCls} placeholder="Product name" value={name} onChange={e => setName(e.target.value)} required />
          <input className={inputCls} placeholder="SKU (optional)" value={sku} onChange={e => setSku(e.target.value)} />
          <select className={inputCls} value={cat} onChange={e => setCat(e.target.value)}><option value="">Category…</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input className={inputCls} type="number" min="0" step="0.01" placeholder="Cost / purchase price (PKR)" value={cost} onChange={e => setCost(e.target.value)} required />
          <input className={inputCls} type="number" min="0" placeholder="Profit %" value={profit} onChange={e => setProfit(e.target.value)} />
          <input className={inputCls} type="number" min="1" placeholder="Qty" value={qty} onChange={e => setQty(e.target.value)} required />
        </div>
        <div className="text-sm">Sale price will be: <b>{fmt(salePrice)}</b></div>
        <button disabled={busy} className={btnCls}>Add Stock</button>
        {msg && <div className="text-sm">{msg}</div>}
      </form>
      <input className={inputCls} placeholder="Search stock by name / SKU / barcode…" value={q} onChange={e => setQ(e.target.value)} />
      <div className={cardCls}>
        <table className="w-full text-sm"><thead><tr><th className={thCls}>Product</th><th className={thCls}>Category</th><th className={thCls}>Sale Price</th><th className={thCls}>Qty</th><th className={thCls}></th></tr></thead>
          <tbody>{filtered.map(p => editId === p.id ? (
            <tr key={p.id} className="border-b bg-yellow-50 dark:bg-gray-700">
              <td className="py-2 px-2"><input className={inputCls} value={eName} onChange={e => setEName(e.target.value)} placeholder="Product name" /><input className={`${inputCls} mt-1`} value={eBrand} onChange={e => setEBrand(e.target.value)} placeholder="Brand (optional)" /></td>
              <td className="px-2"><select className={inputCls} value={eCat} onChange={e => setECat(e.target.value)}><option value="">Category…</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
              <td className="px-2"><input className={inputCls} type="number" min="0" step="0.01" value={ePrice} onChange={e => setEPrice(e.target.value)} placeholder="Sale price" /></td>
              <td className="px-2"><input className={inputCls} type="number" min="0" value={eMin} onChange={e => setEMin(e.target.value)} placeholder="Low stock at" /></td>
              <td className="px-2 whitespace-nowrap"><button onClick={saveEdit} disabled={busy} className="border rounded px-2 mr-1 bg-teal-700 text-white">Save</button><button onClick={() => setEditId(null)} className="border rounded px-2">Cancel</button></td>
            </tr>
          ) : (
            <tr key={p.id} className="border-b"><td className="py-2 px-2">{p.name}<div className="text-xs text-gray-500">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</div></td><td className="px-2">{catName(data, p.category_id)}</td><td className="px-2 font-semibold">{fmt(p.selling_price)}</td><td className="px-2">{Number(p.quantity)}</td><td className="px-2 whitespace-nowrap"><button onClick={() => adjust(p, 1)} className="border rounded px-2 mr-1">+1</button><button onClick={() => adjust(p, -1)} className="border rounded px-2 mr-1">−1</button>{role === 'admin' && <><button onClick={() => startEdit(p)} className="border rounded px-2 mr-1">Edit</button><button onClick={() => removeProduct(p)} className="border rounded px-2 text-red-600">Delete</button></>}</td></tr>
          ))}</tbody></table>
        {filtered.length === 0 && <div className="text-sm text-gray-500 py-2">No products found.</div>}
      </div>
      <div className={cardCls}>
        <div className="font-semibold mb-2">Recent Stock Movements</div>
        {data.movements.slice(0, 15).map((m: any) => <div key={m.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{prodName(data, m.product_id)} · {m.move_type}</span><span>{Number(m.quantity) > 0 ? '+' : ''}{Number(m.quantity)} → {Number(m.balance_after)}</span></div>)}
      </div>
    </div>
  )
}

// ---------- POS ----------
export function POSPage({ data, role, refresh }: { data: AllData; role: Role; refresh: () => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState(0)
  const [paid, setPaid] = useState(0)
  const [method, setMethod] = useState('Cash')
  const [msg, setMsg] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const [returnSale, setReturnSale] = useState('')
  const [returnQty, setReturnQty] = useState(1)
  const filtered = data.products.filter(p => p.status !== 'inactive' && Number(p.quantity) > 0 && (!cat || p.category_id === cat) && [p.name, p.sku, p.barcode ?? '', p.brand ?? '', ((p as any).compatible_models ?? []).join(' ')].join(' ').toLowerCase().includes(q.toLowerCase()))
  const subtotal = cart.reduce((s, l) => s + l.qty * l.price - l.lineDiscount, 0)
  const total = Math.max(0, subtotal - discount)
  const addToCart = (p: any) => {
    setCart(prev => { const ex = prev.find(l => l.product.id === p.id); if (ex) return prev.map(l => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l); return [...prev, { product: p, qty: 1, price: Number(p.selling_price), lineDiscount: 0 }] })
  }
  const sale = async () => {
    if (!cart.length) return
    setMsg('')
    try {
      const r = await completeSale({ customerId: customerId || null, lines: cart, discount, paid, paymentMethod: method, allowNegative: role === 'admin' })
      setReceipt({ invoiceNo: r.invoiceNo, lines: cart.map(l => ({ label: `${l.product.name} × ${l.qty}`, value: fmt(l.qty * l.price - l.lineDiscount) })), total: fmt(r.grandTotal), paid: fmt(paid), extra: `Balance: ${fmt(r.grandTotal - paid)} · ${method}` })
      setMsg(`Sale ${r.invoiceNo} completed — ${fmt(r.grandTotal)}. Stock updated in Supabase.`)
      setCart([]); setPaid(0); setDiscount(0); await refresh()
    } catch (err: any) { setMsg('Error: ' + err.message) }
  }
  const doReturn = async () => {
    const s = data.sales.find(x => x.invoice_no === returnSale.trim() || x.id === returnSale.trim())
    if (!s) { setMsg('Sale not found. Enter the invoice no, e.g. SALE-…'); return }
    const items = data.saleItems.filter((i: any) => i.sale_id === s.id)
    if (!items.length) { setMsg('No items on that sale.'); return }
    const it = items[0]
    const refund = Number(it.unit_price) * returnQty
    try {
      const ret = await createSaleReturn(s.id, s.invoice_no, [{ productId: it.product_id, qty: returnQty, unitPrice: Number(it.unit_price) }], 'POS return', refund)
      setMsg(`Return created — refund ${fmt(refund)}, stock restored. Original invoice unchanged.`)
      await refresh()
    } catch (err: any) { setMsg('Error: ' + err.message) }
  }
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <input className={inputCls} placeholder="Search product by name / SKU / barcode — Enter adds to cart" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && filtered[0]) { addToCart(filtered[0]); setQ('') } }} />
          <div className="flex gap-2 flex-wrap">{['', ...data.categories.map(c => c.id)].map(c => <button key={c || 'all'} onClick={() => setCat(c)} className={`px-2 py-1 rounded-full text-xs border ${cat === c ? 'bg-teal-700 text-white' : 'bg-white dark:bg-gray-800'}`}>{c ? catName(data, c) : 'All'}</button>)}</div>
          <div className="grid grid-cols-2 gap-2">
            {filtered.slice(0, 12).map(p => <button key={p.id} onClick={() => addToCart(p)} className={`${cardCls} text-left`}><div className="font-semibold text-sm">{p.name}</div><div className="text-sm">{fmt(p.selling_price)}</div><div className="text-xs text-gray-500">Qty {Number(p.quantity)} · {p.sku}</div></button>)}
          </div>
          {filtered.length === 0 && <div className="text-sm text-gray-500">No in-stock product matches.</div>}
        </div>
        <div className={`${cardCls} space-y-2 h-fit`}>
          <div className="font-semibold">Cart</div>
          {cart.map((l, i) => <div key={i} className="flex items-center gap-2 text-sm border-b py-1">
            <span className="flex-1">{l.product.name}</span>
            <input type="number" min="1" value={l.qty} onChange={e => setCart(cart.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} className="w-14 border rounded px-1 py-0.5" />
            {role === 'admin' ? <input type="number" min="0" value={l.price} onChange={e => setCart(cart.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} className="w-20 border rounded px-1 py-0.5" /> : <span>{fmt(l.price)}</span>}
            <span className="font-semibold">{fmt(l.qty * l.price - l.lineDiscount)}</span>
            <button onClick={() => setCart(cart.filter((_, j) => j !== i))} className="text-red-600">✕</button>
          </div>)}
          {cart.length === 0 && <div className="text-sm text-gray-500">Cart is empty.</div>}
          <select className={inputCls} value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">Walk-in Customer</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Discount (PKR)<input type="number" min="0" className={inputCls} value={discount} onChange={e => setDiscount(Number(e.target.value))} /></label>
            <label className="text-sm">Paid (PKR)<input type="number" min="0" className={inputCls} value={paid} onChange={e => setPaid(Number(e.target.value))} /></label>
          </div>
          <select className={inputCls} value={method} onChange={e => setMethod(e.target.value)}>{['Cash', 'Bank', 'JazzCash', 'Easypaisa', 'Card'].map(m => <option key={m}>{m}</option>)}</select>
          <div className="flex justify-between font-bold"><span>Total</span><span>{fmt(total)}</span></div>
          <div className="flex justify-between text-sm"><span>Remaining (credit)</span><span>{fmt(total - paid)}</span></div>
          <button onClick={sale} disabled={!cart.length} className={btnCls + ' w-full'}>Complete Sale</button>
          {msg && <div className="text-sm">{msg}</div>}
        </div>
      </div>
      {receipt && <div><Receipt title={`Receipt ${receipt.invoiceNo}`} lines={receipt.lines} total={receipt.total} paid={receipt.paid} extra={receipt.extra} /><button onClick={() => window.print()} className="mt-2 border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800">Print Receipt</button></div>}
      <div className={`${cardCls} space-y-2`}>
        <div className="font-semibold">Sales Return</div>
        <div className="flex gap-2 flex-wrap"><input className={inputCls + ' flex-1'} placeholder="Sale invoice no (e.g. SALE-…)" value={returnSale} onChange={e => setReturnSale(e.target.value)} /><input type="number" min="1" className="border rounded-lg px-3 py-2 w-24 bg-white dark:bg-gray-800" value={returnQty} onChange={e => setReturnQty(Number(e.target.value))} /><button onClick={doReturn} className={btnCls}>Return Item</button></div>
      </div>
      <div className={cardCls}>
        <div className="font-semibold mb-2">Sales History</div>
        {data.sales.slice(0, 20).map(s => <div key={s.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{s.invoice_no} · {s.sale_date.slice(0, 10)} · {s.status}</span><span>{fmt(s.grand_total)} · Paid {fmt(s.paid)} · Balance {fmt(s.balance)}</span></div>)}
      </div>
    </div>
  )
}

// ---------- PURCHASES ----------
export function PurchasesPage({ data, role, refresh }: { data: AllData; role: Role; refresh: () => void }) {
  const [supplierId, setSupplierId] = useState('')
  const [newSupplier, setNewSupplier] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [invoiceNo, setInvoiceNo] = useState(uid('PUR'))
  const [date, setDate] = useState(todayPK())
  const [discount, setDiscount] = useState(0)
  const [extra, setExtra] = useState(0)
  const [paid, setPaid] = useState(0)
  const [method, setMethod] = useState('Cash')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<{ productId: string; qty: number; rate: number; profit: number }[]>([{ productId: '', qty: 1, rate: 0, profit: 30 }])
  const [msg, setMsg] = useState('')
  const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const grandTotal = subtotal - discount + extra
  const save = async (status: 'draft' | 'confirmed') => {
    setMsg('')
    try {
      let sid = supplierId
      if (!sid && newSupplier) {
        const { data: s, error } = await supabase.from('suppliers').insert({ name: newSupplier, phone: newSupplierPhone || '00000000000' }).select().single()
        if (error) throw new Error(error.message)
        sid = s.id
      }
      if (!sid) { setMsg('Choose a supplier or add a new one.'); return }
      const valid = lines.filter(l => l.productId && l.qty > 0)
      if (!valid.length) { setMsg('Add at least one product line.'); return }
      const id = await savePurchase({
        invoiceNo, supplierId: sid, date, discount, extraCharges: extra, paid, paymentMethod: method, notes, status,
        lines: valid.map(l => ({ productId: l.productId, qty: l.qty, rate: l.rate, salePrice: Math.round(l.rate * (1 + l.profit / 100) * 100) / 100 })),
      }, status === 'confirmed')
      setMsg(status === 'confirmed' ? `Purchase confirmed — stock increased, sale prices updated from cost + profit%.` : `Draft saved.`)
      setInvoiceNo(uid('PUR')); setLines([{ productId: '', qty: 1, rate: 0, profit: 30 }]); setPaid(0)
      await refresh()
    } catch (err: any) { setMsg('Error: ' + err.message) }
  }
  return (
    <div className="space-y-4">
      <div className={`${cardCls} space-y-2`}>
        <div className="font-semibold">New Purchase — cost is only visible here; sale price = cost + profit %</div>
        <div className="grid md:grid-cols-2 gap-2">
          <select className={inputCls} value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Supplier…</option>{data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name} · {s.phone}</option>)}</select>
          <input className={inputCls} placeholder="Invoice no" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} />
          <input className={inputCls} placeholder="New supplier name (optional)" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} />
          <input className={inputCls} placeholder="New supplier phone" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)} />
          <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          <select className={inputCls} value={method} onChange={e => setMethod(e.target.value)}>{['Cash', 'Bank', 'JazzCash', 'Easypaisa', 'Credit'].map(m => <option key={m}>{m}</option>)}</select>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-2 border rounded-lg p-2">
            <select className={inputCls + ' col-span-2'} value={l.productId} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))}><option value="">Product…</option>{data.products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select>
            <input type="number" min="1" className={inputCls} placeholder="Qty" value={l.qty} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
            <input type="number" min="0" step="0.01" className={inputCls} placeholder="Rate / cost" value={l.rate} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) } : x))} />
            <input type="number" min="0" className={inputCls} placeholder="Profit %" value={l.profit} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, profit: Number(e.target.value) } : x))} />
            <div className="text-sm self-center">Sale: <b>{fmt(l.rate * (1 + l.profit / 100))}</b> · Line: {fmt(l.qty * l.rate)}</div>
          </div>
        ))}
        <button onClick={() => setLines([...lines, { productId: '', qty: 1, rate: 0, profit: 30 }])} className="border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800">+ Add Line</button>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">Discount<input type="number" min="0" className={inputCls} value={discount} onChange={e => setDiscount(Number(e.target.value))} /></label>
          <label className="text-sm">Extra charges<input type="number" min="0" className={inputCls} value={extra} onChange={e => setExtra(Number(e.target.value))} /></label>
          <label className="text-sm">Paid<input type="number" min="0" className={inputCls} value={paid} onChange={e => setPaid(Number(e.target.value))} /></label>
        </div>
        <div className="flex justify-between font-bold"><span>Grand Total</span><span>{fmt(grandTotal)}</span></div>
        <div className="text-sm">Remaining supplier balance: {fmt(grandTotal - paid)}</div>
        <input className={inputCls} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex gap-2"><button onClick={() => save('draft')} className="border rounded-lg px-4 py-2 bg-white dark:bg-gray-800">Save Draft</button><button onClick={() => save('confirmed')} className={btnCls}>Confirm Purchase</button></div>
        {msg && <div className="text-sm">{msg}</div>}
      </div>
      <div className={cardCls}>
        <div className="font-semibold mb-2">Purchase History</div>
        {data.purchases.slice(0, 20).map(p => <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{p.invoice_no} · {p.purchase_date} · {p.status}</span><span>{fmt(p.grand_total)} · Paid {fmt(p.paid)} · Balance {fmt(p.balance)}</span></div>)}
      </div>
    </div>
  )
}

// ---------- REPAIRS ----------
const REPAIR_STATUSES = ['received', 'diagnosing', 'waiting_for_parts', 'in_progress', 'ready', 'delivered', 'cancelled']
export function RepairsPage({ data, role, refresh }: { data: AllData; role: Role; refresh: () => void }) {
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [brand, setBrand] = useState(''), [model, setModel] = useState('')
  const [imei, setImei] = useState(''), [color, setColor] = useState(''), [problem, setProblem] = useState('')
  const [condition, setCondition] = useState(''), [accessories, setAccessories] = useState('')
  const [est, setEst] = useState(0), [advance, setAdvance] = useState(0), [labour, setLabour] = useState(0), [warranty, setWarranty] = useState(30)
  const [partId, setPartId] = useState(''), [partQty, setPartQty] = useState(1)
  const [parts, setParts] = useState<{ product: any; qty: number }[]>([])
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const partsTotal = parts.reduce((s, p) => s + p.qty * Number(p.product.selling_price), 0)
  const partsCost = parts.reduce((s, p) => s + p.qty * Number(p.product.avg_cost), 0)
  const finalCharges = labour + partsTotal
  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('')
    try {
      const jobNo = uid('JOB')
      await saveRepair({ jobNo, customerName: name, customerPhone: phone, brand, model, imei, deviceColor: color, problem, deviceCondition: condition, accessories, status: 'received', estimatedCost: est, advance, labour, finalCharges, warrantyDays: warranty, notes: '', parts }, true)
      setReceipt({ jobNo, lines: [{ label: 'Customer', value: `${name} · ${phone}` }, { label: 'Device', value: `${brand} ${model}` }, { label: 'Problem', value: problem }, ...parts.map(p => ({ label: `${p.product.name} × ${p.qty}`, value: fmt(p.qty * Number(p.product.selling_price)) })), { label: 'Labour', value: fmt(labour) }], total: fmt(finalCharges), paid: fmt(advance), extra: `Advance: ${fmt(advance)} · Repair profit (labour + parts sale − parts cost): ${fmt(labour + partsTotal - partsCost)}` })
      setMsg(`Repair ${jobNo} created. Parts deducted from stock.`)
      setName(''); setPhone(''); setProblem(''); setParts([]); await refresh()
    } catch (err: any) { setMsg('Error: ' + err.message) }
  }
  const setStatus = async (r: any, status: string) => {
    await supabase.from('repairs').update({ status, delivered_at: status === 'delivered' ? new Date().toISOString() : null }).eq('id', r.id)
    await refresh()
  }
  const filtered = data.repairs.filter(r => !filter || r.status === filter)
  return (
    <div className="space-y-4">
      <form onSubmit={create} className={`${cardCls} space-y-2`}>
        <div className="font-semibold">New Repair Ticket</div>
        <div className="grid md:grid-cols-3 gap-2">
          <input className={inputCls} placeholder="Customer name" value={name} onChange={e => setName(e.target.value)} required />
          <input className={inputCls} placeholder="Customer phone" value={phone} onChange={e => setPhone(e.target.value)} required />
          <input className={inputCls} placeholder="Brand" value={brand} onChange={e => setBrand(e.target.value)} />
          <input className={inputCls} placeholder="Model" value={model} onChange={e => setModel(e.target.value)} />
          <input className={inputCls} placeholder="IMEI (optional)" value={imei} onChange={e => setImei(e.target.value)} />
          <input className={inputCls} placeholder="Colour" value={color} onChange={e => setColor(e.target.value)} />
          <input className={inputCls + ' md:col-span-3'} placeholder="Problem" value={problem} onChange={e => setProblem(e.target.value)} required />
          <input className={inputCls} placeholder="Device condition" value={condition} onChange={e => setCondition(e.target.value)} />
          <input className={inputCls} placeholder="Accessories received" value={accessories} onChange={e => setAccessories(e.target.value)} />
          <label className="text-sm">Estimated cost<input type="number" min="0" className={inputCls} value={est} onChange={e => setEst(Number(e.target.value))} /></label>
          <label className="text-sm">Advance<input type="number" min="0" className={inputCls} value={advance} onChange={e => setAdvance(Number(e.target.value))} /></label>
          <label className="text-sm">Labour charges<input type="number" min="0" className={inputCls} value={labour} onChange={e => setLabour(Number(e.target.value))} /></label>
          <label className="text-sm">Warranty days<input type="number" min="0" className={inputCls} value={warranty} onChange={e => setWarranty(Number(e.target.value))} /></label>
        </div>
        <div className="flex gap-2">
          <select className={inputCls + ' flex-1'} value={partId} onChange={e => setPartId(e.target.value)}><option value="">Part from stock…</option>{data.products.filter(p => Number(p.quantity) > 0).map(p => <option key={p.id} value={p.id}>{p.name} · {fmt(p.selling_price)} · Qty {Number(p.quantity)}</option>)}</select>
          <input type="number" min="1" className="border rounded-lg px-3 py-2 w-20 bg-white dark:bg-gray-800" value={partQty} onChange={e => setPartQty(Number(e.target.value))} />
          <button type="button" onClick={() => { const p = data.products.find(x => x.id === partId); if (p) { setParts([...parts, { product: p, qty: partQty }]); setPartId('') } }} className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-800">+ Part</button>
        </div>
        {parts.map((p, i) => <div key={i} className="text-sm flex justify-between"><span>{p.product.name} × {p.qty}</span><span>{fmt(p.qty * Number(p.product.selling_price))}</span></div>)}
        <div className="font-bold">Final charges: {fmt(finalCharges)} · Repair profit: {fmt(labour + partsTotal - partsCost)}</div>
        <button className={btnCls}>Create Repair Ticket</button>
        {msg && <div className="text-sm">{msg}</div>}
      </form>
      {receipt && <div><Receipt title={`Repair ${receipt.jobNo}`} lines={receipt.lines} total={receipt.total} paid={receipt.paid} extra={receipt.extra} /><button onClick={() => window.print()} className="mt-2 border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800">Print Receipt</button></div>}
      <div className="flex gap-2 flex-wrap">{['', ...REPAIR_STATUSES].map(s => <button key={s || 'all'} onClick={() => setFilter(s)} className={`px-2 py-1 rounded-full text-xs border ${filter === s ? 'bg-teal-700 text-white' : 'bg-white dark:bg-gray-800'}`}>{s || 'All'}</button>)}</div>
      <div className={cardCls}>
        {filtered.slice(0, 20).map(r => {
          const rParts = data.repairParts.filter((p: any) => p.repair_id === r.id)
          const pSale = rParts.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.unit_price), 0)
          const pCost = rParts.reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.unit_cost), 0)
          return <div key={r.id} className="border-b py-2 last:border-0 text-sm">
            <div className="flex justify-between flex-wrap gap-2"><span className="font-semibold">{r.job_no} · {r.customer_name} · {r.customer_phone}</span><span>{r.brand} {r.model} · {fmt(r.final_charges)}</span></div>
            <div className="text-gray-500">{r.problem} · Profit {fmt(Number(r.labour_charges) + pSale - pCost)} · Advance {fmt(r.advance)}</div>
            <select className="border rounded px-2 py-1 mt-1 bg-white dark:bg-gray-800" value={r.status} onChange={e => setStatus(r, e.target.value)}>{REPAIR_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          </div>
        })}
        {filtered.length === 0 && <div className="text-sm text-gray-500">No repairs.</div>}
      </div>
    </div>
  )
}

// ---------- PARTIES ----------
export function PartiesPage({ data, role, refresh }: { data: AllData; role: Role; refresh: () => void }) {
  const [tab, setTab] = useState<'customers' | 'suppliers'>('customers')
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [address, setAddress] = useState('')
  const [msg, setMsg] = useState('')
  const [payParty, setPayParty] = useState(''), [payAmount, setPayAmount] = useState(0)
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const table = tab === 'customers' ? 'customers' : 'suppliers'
    const { error } = await supabase.from(table).insert({ name, phone, address: address || null })
    if (error) { setMsg('Error: ' + error.message); return }
    setName(''); setPhone(''); setAddress(''); setMsg('Added.'); await refresh()
  }
  const pay = async () => {
    if (!payParty || payAmount <= 0) return
    try { await recordPayment(tab === 'customers' ? 'customer' : 'supplier', payParty, payAmount, 'cash', 'Payment recorded'); setMsg(`Payment of ${fmt(payAmount)} recorded — balance reduced, one cashbook entry written.`); setPayAmount(0); await refresh() }
    catch (err: any) { setMsg('Error: ' + err.message) }
  }
  const list = tab === 'customers' ? data.customers : data.suppliers
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{(['customers', 'suppliers'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-full capitalize ${tab === t ? 'bg-teal-700 text-white' : 'bg-white dark:bg-gray-800 border'}`}>{t}</button>)}</div>
      <form onSubmit={add} className={`${cardCls} flex gap-2 flex-wrap`}>
        <input className={inputCls + ' flex-1 min-w-40'} placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
        <input className={inputCls + ' flex-1 min-w-40'} placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} required />
        <input className={inputCls + ' flex-1 min-w-40'} placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} />
        <button className={btnCls}>Add {tab === 'customers' ? 'Customer' : 'Supplier'}</button>
      </form>
      {msg && <div className="text-sm">{msg}</div>}
      <div className={`${cardCls} flex gap-2 flex-wrap items-end`}>
        <select className={inputCls + ' flex-1 min-w-40'} value={payParty} onChange={e => setPayParty(e.target.value)}><option value="">Record payment for…</option>{list.map((p: any) => <option key={p.id} value={p.id}>{p.name} · Owes {fmt(p.opening_balance)}</option>)}</select>
        <input type="number" min="0" className="border rounded-lg px-3 py-2 w-32 bg-white dark:bg-gray-800" placeholder="Amount" value={payAmount || ''} onChange={e => setPayAmount(Number(e.target.value))} />
        <button onClick={pay} className={btnCls}>Record Payment</button>
      </div>
      <div className={cardCls}>
        {list.map((p: any) => {
          const sales = tab === 'customers' ? data.sales.filter(s => s.customer_id === p.id) : data.purchases.filter(x => x.supplier_id === p.id)
          const repairs = tab === 'customers' ? data.repairs.filter(r => r.customer_phone === p.phone) : []
          return <div key={p.id} className="border-b py-2 last:border-0 text-sm">
            <div className="flex justify-between"><span className="font-semibold">{p.name} · {p.phone}</span><span>Outstanding: <b>{fmt(p.opening_balance)}</b></span></div>
            <div className="text-gray-500">{p.address ?? ''} · {sales.length} {tab === 'customers' ? 'sales' : 'purchases'} · {repairs.length} repairs</div>
          </div>
        })}
        {list.length === 0 && <div className="text-sm text-gray-500">None yet.</div>}
      </div>
    </div>
  )
}

// ---------- EXPENSES / CASHBOOK / REPORTS ----------
export function ExpensesPage({ data, role, refresh }: { data: AllData; role: Role; refresh: () => void }) {
  const [desc, setDesc] = useState(''), [amount, setAmount] = useState(0), [cat, setCat] = useState(''), [date, setDate] = useState(todayPK()), [msg, setMsg] = useState('')
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await addExpense({ categoryId: cat || null, description: desc, amount, date, method: 'cash' }); setMsg('Expense added and cashbook updated.'); setDesc(''); setAmount(0); await refresh() }
    catch (err: any) { setMsg('Error: ' + err.message) }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={add} className={`${cardCls} flex gap-2 flex-wrap`}>
        <select className={inputCls + ' flex-1 min-w-40'} value={cat} onChange={e => setCat(e.target.value)}><option value="">Category…</option>{data.expenseCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input className={inputCls + ' flex-1 min-w-40'} placeholder="Description" value={desc} onChange={e => setDesc(e.target.value)} required />
        <input type="number" min="0" className="border rounded-lg px-3 py-2 w-32 bg-white dark:bg-gray-800" placeholder="Amount" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} required />
        <input type="date" className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-800" value={date} onChange={e => setDate(e.target.value)} />
        <button className={btnCls}>Add Expense</button>
      </form>
      {msg && <div className="text-sm">{msg}</div>}
      <div className={cardCls}>
        {data.expenses.slice(0, 20).map((e: any) => <div key={e.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{e.expense_date} · {e.description}</span><span>{fmt(e.amount)}</span></div>)}
      </div>
    </div>
  )
}

export function CashbookPage({ data }: { data: AllData; role: Role; refresh: () => void }) {
  const cashIn = data.cashbook.filter((c: any) => c.type === 'in').reduce((s: number, c: any) => s + Number(c.amount), 0)
  const cashOut = data.cashbook.filter((c: any) => c.type === 'out').reduce((s: number, c: any) => s + Number(c.amount), 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className={cardCls}><div className="text-xs text-gray-500">Cash In</div><div className="text-lg font-bold text-emerald-700">{fmt(cashIn)}</div></div>
        <div className={cardCls}><div className="text-xs text-gray-500">Cash Out</div><div className="text-lg font-bold text-red-700">{fmt(cashOut)}</div></div>
        <div className={cardCls}><div className="text-xs text-gray-500">Closing Balance</div><div className="text-lg font-bold">{fmt(cashIn - cashOut)}</div></div>
      </div>
      <div className={cardCls}>
        {data.cashbook.slice(0, 30).map((c: any) => <div key={c.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{c.entry_date} · {c.source} · {c.description ?? ''}</span><span className={c.type === 'in' ? 'text-emerald-700' : 'text-red-700'}>{c.type === 'in' ? '+' : '−'}{fmt(c.amount)}</span></div>)}
        {data.cashbook.length === 0 && <div className="text-sm text-gray-500">No cashbook entries yet.</div>}
      </div>
    </div>
  )
}

export function ReportsPage({ data }: { data: AllData; role: Role; refresh: () => void }) {
  const sales = data.sales.filter(s => s.status === 'confirmed')
  const cogs = data.saleItems.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_cost), 0)
  const salesTotal = sales.reduce((s, x) => s + Number(x.grand_total), 0)
  const purchTotal = data.purchases.filter(p => p.status === 'confirmed').reduce((s, x) => s + Number(x.grand_total), 0)
  const expTotal = data.expenses.reduce((s: number, x: any) => s + Number(x.amount), 0)
  const repairProfit = data.repairs.reduce((s, r) => {
    const parts = data.repairParts.filter((p: any) => p.repair_id === r.id)
    return s + Number(r.labour_charges) + parts.reduce((a: number, p: any) => a + Number(p.quantity) * (Number(p.unit_price) - Number(p.unit_cost)), 0)
  }, 0)
  const byProduct = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; rev: number; cost: number }>()
    for (const i of data.saleItems) {
      const cur = m.get(i.product_id) ?? { name: prodName(data, i.product_id), qty: 0, rev: 0, cost: 0 }
      cur.qty += Number(i.quantity); cur.rev += Number(i.line_total); cur.cost += Number(i.quantity) * Number(i.unit_cost)
      m.set(i.product_id, cur)
    }
    return [...m.values()].sort((a, b) => b.rev - a.rev)
  }, [data])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['Total Sales', salesTotal], ['Total Purchases', purchTotal], ['Total Expenses', expTotal], ['Gross Profit (sales − COGS)', salesTotal - cogs], ['Repair Profit', repairProfit], ['Net P&L', salesTotal - cogs - expTotal + repairProfit], ['Inventory (sale value)', data.products.reduce((s, p) => s + Number(p.quantity) * Number(p.selling_price), 0)], ['Inventory (cost value)', data.products.reduce((s, p) => s + Number(p.quantity) * Number(p.avg_cost), 0)]].map(([l, v]) => (
          <div key={l as string} className={cardCls}><div className="text-xs text-gray-500">{l}</div><div className="text-lg font-bold">{fmt(v as number)}</div></div>
        ))}
      </div>
      <div className={`${cardCls} flex gap-2 flex-wrap`}>
        <button onClick={() => downloadCsv('hm-pos-sales.csv', [['Invoice', 'Date', 'Total', 'Paid', 'Balance'], ...sales.map(s => [s.invoice_no, s.sale_date.slice(0, 10), String(s.grand_total), String(s.paid), String(s.balance)])])} className="border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800">Export Sales CSV</button>
        <button onClick={() => downloadCsv('hm-pos-products.csv', [['Product', 'SKU', 'Sale Price', 'Qty'], ...data.products.map(p => [p.name, p.sku, String(p.selling_price), String(p.quantity)])])} className="border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800">Export Products CSV</button>
        <button onClick={() => downloadCsv('hm-pos-profit-by-product.csv', [['Product', 'Qty Sold', 'Revenue', 'COGS', 'Profit'], ...byProduct.map(b => [b.name, String(b.qty), String(b.rev), String(b.cost), String(b.rev - b.cost)])])} className="border rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800">Export Profit by Product CSV</button>
      </div>
      <div className={cardCls}>
        <div className="font-semibold mb-2">Profit by Product (COGS = avg cost at sale)</div>
        {byProduct.map(b => <div key={b.name} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{b.name} · {b.qty} sold</span><span>Revenue {fmt(b.rev)} · Profit {fmt(b.rev - b.cost)}</span></div>)}
        {byProduct.length === 0 && <div className="text-sm text-gray-500">No sales yet.</div>}
      </div>
      <div className={cardCls}>
        <div className="font-semibold mb-2">Customer Outstanding</div>
        {data.customers.filter(c => Number(c.opening_balance) > 0).map(c => <div key={c.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{c.name} · {c.phone}</span><span>{fmt(c.opening_balance)}</span></div>)}
        <div className="font-semibold mb-2 mt-4">Supplier Outstanding</div>
        {data.suppliers.filter(s => Number(s.opening_balance) > 0).map(s => <div key={s.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{s.name} · {s.phone}</span><span>{fmt(s.opening_balance)}</span></div>)}
      </div>
    </div>
  )
}
