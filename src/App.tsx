import { useEffect, useMemo, useState } from 'react'
import { supabase, SHOP, fmt, resolveRole, type Role } from './lib/supabase'
import { fetchAll, type AllData } from './lib/store'
import { StockPage, POSPage, PurchasesPage, RepairsPage, PartiesPage, ExpensesPage, CashbookPage, ReportsPage } from './pages/Modules'

type View = 'dashboard' | 'stock' | 'pos' | 'purchases' | 'repairs' | 'parties' | 'expenses' | 'cashbook' | 'reports'

const NAV: { id: View; en: string; ur: string; roles: Role[] }[] = [
  { id: 'dashboard', en: 'Dashboard', ur: 'ڈیش بورڈ', roles: ['admin', 'cashier', 'technician'] },
  { id: 'pos', en: 'POS Sales', ur: 'فروخت', roles: ['admin', 'cashier'] },
  { id: 'stock', en: 'Stock', ur: 'اسٹاک', roles: ['admin', 'cashier'] },
  { id: 'purchases', en: 'Purchases', ur: 'خریداری', roles: ['admin', 'cashier'] },
  { id: 'repairs', en: 'Repairs', ur: 'مرمت', roles: ['admin', 'technician'] },
  { id: 'parties', en: 'Customers & Suppliers', ur: 'گاہک و سپلائر', roles: ['admin', 'cashier'] },
  { id: 'expenses', en: 'Expenses', ur: 'اخراجات', roles: ['admin', 'cashier'] },
  { id: 'cashbook', en: 'Cashbook', ur: 'کیش بک', roles: ['admin', 'cashier'] },
  { id: 'reports', en: 'Reports', ur: 'رپورٹس', roles: ['admin'] },
]

export default function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<{ email: string; id: string } | null>(null)
  const [role, setRole] = useState<Role>('cashier')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [view, setView] = useState<View>('dashboard')
  const [data, setData] = useState<AllData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [lang, setLang] = useState<'en' | 'ur'>('en')
  const [dark, setDark] = useState(false)
  const [range, setRange] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [query, setQuery] = useState('')

  const refresh = async () => {
    setLoading(true); setLoadError('')
    try { setData(await fetchAll()) } catch (e: any) { setLoadError(e.message) } finally { setLoading(false) }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser({ email: session.user.email ?? '', id: session.user.id })
        setRole(await resolveRole(session.user.email ?? '', session.user.id))
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) {
        setUser({ email: session.user.email ?? '', id: session.user.id })
        setRole(await resolveRole(session.user.email ?? '', session.user.id))
      } else setUser(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (user) refresh() }, [user])

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError(''); setAuthBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setAuthBusy(false)
    if (error || !data.user) { setAuthError(error?.message ?? 'Login failed'); return }
    setUser({ email: data.user.email ?? email, id: data.user.id })
    setRole(await resolveRole(data.user.email ?? email, data.user.id))
  }
  const logout = async () => { await supabase.auth.signOut(); setUser(null); setData(null); setView('dashboard') }

  const dates = useMemo(() => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: SHOP.timezone }))
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const start = new Date(now), end = new Date(now)
    if (range === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1) }
    if (range === 'week') start.setDate(start.getDate() - 6)
    if (range === 'month') start.setDate(start.getDate() - 29)
    if (range === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo }
    return { from: iso(start), to: iso(end) }
  }, [range, customFrom, customTo])

  const inRange = (d: string) => { const day = d.slice(0, 10); return day >= dates.from && day <= dates.to }

  const dash = useMemo(() => {
    if (!data) return null
    const sales = data.sales.filter(s => s.status === 'confirmed' && inRange(s.sale_date))
    const purchases = data.purchases.filter(p => p.status === 'confirmed' && inRange(p.purchase_date))
    const expenses = data.expenses.filter(e => inRange(e.expense_date))
    const saleIds = new Set(sales.map(s => s.id))
    const cogs = data.saleItems.filter(i => saleIds.has(i.sale_id)).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0)
    const salesTotal = sales.reduce((s, x) => s + Number(x.grand_total), 0)
    const purchTotal = purchases.reduce((s, x) => s + Number(x.grand_total), 0)
    const expTotal = expenses.reduce((s, x) => s + Number(x.amount), 0)
    return {
      salesTotal, purchTotal, expTotal, gross: salesTotal - cogs,
      net: salesTotal - cogs - expTotal, salesCount: sales.length,
      invValue: data.products.reduce((s, p) => s + Number(p.quantity) * Number(p.selling_price), 0),
      invCost: data.products.reduce((s, p) => s + Number(p.quantity) * Number(p.avg_cost), 0),
      totalProducts: data.products.length,
      lowStock: data.products.filter(p => Number(p.quantity) <= Number(p.min_stock) && Number(p.quantity) > 0).length,
      outStock: data.products.filter(p => Number(p.quantity) <= 0).length,
      customers: data.customers.length,
      custOut: data.customers.reduce((s, c) => s + Number(c.opening_balance), 0),
      suppOut: data.suppliers.reduce((s, x) => s + Number(x.opening_balance), 0),
      pendingRepairs: data.repairs.filter(r => !['delivered', 'cancelled'].includes(r.status)).length,
      readyRepairs: data.repairs.filter(r => r.status === 'ready').length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dates])

  const searchResults = useMemo(() => {
    if (!data || query.trim().length < 2) return null
    const q = query.trim().toLowerCase()
    return {
      products: data.products.filter(p => [p.name, p.sku, p.barcode ?? ''].join(' ').toLowerCase().includes(q)).slice(0, 8),
      customers: data.customers.filter(c => [c.name, c.phone].join(' ').toLowerCase().includes(q)).slice(0, 5),
      suppliers: data.suppliers.filter(s => [s.name, s.phone].join(' ').toLowerCase().includes(q)).slice(0, 5),
      sales: data.sales.filter(s => s.invoice_no.toLowerCase().includes(q)).slice(0, 5),
      purchases: data.purchases.filter(p => p.invoice_no.toLowerCase().includes(q)).slice(0, 5),
      repairs: data.repairs.filter(r => [r.job_no, r.customer_name, r.customer_phone, r.model ?? ''].join(' ').toLowerCase().includes(q)).slice(0, 5),
      expenses: data.expenses.filter(e => e.description.toLowerCase().includes(q)).slice(0, 5),
    }
  }, [data, query])

  const t = (en: string, ur: string) => (lang === 'ur' ? ur : en)

  if (!user) {
    return (
      <div className="min-h-screen bg-teal-900 flex items-center justify-center p-4">
        <form onSubmit={login} className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
          <div className="text-center">
            <div className="text-2xl font-black text-teal-800">{SHOP.name}</div>
            <div className="text-xs text-gray-500">{SHOP.fullName}</div>
            <div className="text-xs text-gray-500">{SHOP.address} · {SHOP.phone}</div>
            <span className="inline-block mt-2 text-xs bg-teal-100 text-teal-800 px-2 py-1 rounded-full">● Supabase Connected</span>
          </div>
          <input className="w-full border rounded-lg px-3 py-2" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="w-full border rounded-lg px-3 py-2" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          {authError && <div className="text-red-600 text-sm">{authError}</div>}
          <button disabled={authBusy} className="w-full bg-teal-700 text-white rounded-lg py-2 font-semibold disabled:opacity-50">{authBusy ? 'Signing in…' : 'Login'}</button>
          <div className="text-xs text-gray-500 text-center">Admin: admin@hmmobile.pk · Cashier: cashier@hmmobile.pk · Technician: tech@hmmobile.pk</div>
        </form>
      </div>
    )
  }

  const allowedNav = NAV.filter(n => n.roles.includes(role))
  return (
    <div dir={lang === 'ur' ? 'rtl' : 'ltr'} className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex">
        <aside className="hidden md:flex flex-col w-60 bg-teal-900 text-white p-4 gap-1 shrink-0">
          <div className="font-black text-xl">{SHOP.name}</div>
          <div className="text-xs text-teal-200 mb-3">{SHOP.address}<br />{SHOP.phone}</div>
          {allowedNav.map(n => (
            <button key={n.id} onClick={() => setView(n.id)} className={`text-left px-3 py-2 rounded-lg ${view === n.id ? 'bg-teal-700' : 'hover:bg-teal-800'}`}>{lang === 'ur' ? n.ur : n.en}</button>
          ))}
          <div className="mt-auto text-xs text-teal-200">{user.email} · {role}<br />● Supabase Connected</div>
          <button onClick={logout} className="text-left px-3 py-2 rounded-lg hover:bg-teal-800">Logout</button>
        </aside>
        <main className="flex-1 p-4 md:p-6 max-w-6xl mx-auto w-full">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h1 className="text-xl font-bold flex-1">{t('HM Mobile POS', 'ایچ ایم موبائل پی او ایس')}</h1>
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">● Supabase Connected</span>
            <button onClick={() => setLang(lang === 'en' ? 'ur' : 'en')} className="border rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800">{lang === 'en' ? 'اردو' : 'English'}</button>
            <button onClick={() => setDark(!dark)} className="border rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800">{dark ? '☀️' : '🌙'}</button>
            <button onClick={refresh} className="border rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-800">↻ Refresh</button>
          </div>
          <div className="md:hidden flex gap-2 overflow-x-auto mb-4">
            {allowedNav.map(n => <button key={n.id} onClick={() => setView(n.id)} className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm ${view === n.id ? 'bg-teal-700 text-white' : 'bg-white dark:bg-gray-800 border'}`}>{lang === 'ur' ? n.ur : n.en}</button>)}
          </div>
          {loading && <div className="text-sm text-gray-500 mb-3">Loading from Supabase…</div>}
          {loadError && <div className="bg-red-100 text-red-800 rounded-lg p-3 mb-3 text-sm">Failed to load from Supabase: {loadError}</div>}
          {view === 'dashboard' && data && dash && (
            <div className="space-y-4">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search anything — product, customer, sale, repair… (sale price only, cost never shown)', 'تلاش کریں — پروڈکٹ، گاہک، سیل، مرمت…')} className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800" />
              {searchResults && (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-2">
                  <div className="font-semibold">Search results for “{query}”</div>
                  {searchResults.products.map(p => <div key={p.id} className="flex justify-between text-sm"><span>{p.name} · {p.sku}</span><span className="font-semibold">{fmt(p.selling_price)} · Qty {Number(p.quantity)}</span></div>)}
                  {searchResults.customers.map(c => <div key={c.id} className="text-sm">Customer: {c.name} · {c.phone} · Owes {fmt(c.opening_balance)}</div>)}
                  {searchResults.suppliers.map(s => <div key={s.id} className="text-sm">Supplier: {s.name} · {s.phone} · Owe {fmt(s.opening_balance)}</div>)}
                  {searchResults.sales.map(s => <div key={s.id} className="text-sm">Sale: {s.invoice_no} · {fmt(s.grand_total)} · Paid {fmt(s.paid)}</div>)}
                  {searchResults.purchases.map(p => <div key={p.id} className="text-sm">Purchase: {p.invoice_no} · {fmt(p.grand_total)}</div>)}
                  {searchResults.repairs.map(r => <div key={r.id} className="text-sm">Repair: {r.job_no} · {r.customer_name} · {r.status}</div>)}
                  {searchResults.expenses.map(e => <div key={e.id} className="text-sm">Expense: {e.description} · {fmt(e.amount)}</div>)}
                  {Object.values(searchResults).every(a => a.length === 0) && <div className="text-sm text-gray-500">No matches.</div>}
                </div>
              )}
              <div className="flex gap-2 flex-wrap items-center">
                {(['today', 'yesterday', 'week', 'month', 'custom'] as const).map(r => <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 rounded-full text-sm capitalize ${range === r ? 'bg-teal-700 text-white' : 'bg-white dark:bg-gray-800 border'}`}>{r}</button>)}
                {range === 'custom' && <><input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800" /><input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border rounded px-2 py-1 bg-white dark:bg-gray-800" /></>}
                <span className="text-sm text-gray-500">{dates.from} → {dates.to}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[['Sales', dash.salesTotal], ['Gross Profit', dash.gross], ['Expenses', dash.expTotal], ['Net Profit', dash.net], ['Inventory Value (sale)', dash.invValue], ['Inventory Value (cost)', dash.invCost], ['Products', dash.totalProducts], ['Low Stock', dash.lowStock], ['Out of Stock', dash.outStock], ['Customers', dash.customers], ['Customer Outstanding', dash.custOut], ['Supplier Outstanding', dash.suppOut], ['Pending Repairs', dash.pendingRepairs], ['Ready Repairs', dash.readyRepairs]].map(([label, v]) => (
                  <div key={label as string} className="bg-white dark:bg-gray-800 rounded-xl p-4"><div className="text-xs text-gray-500">{label}</div><div className="text-lg font-bold">{typeof v === 'number' && (label as string).includes('Profit') || (label as string).includes('Value') || (label as string).includes('Outstanding') || (label as string).includes('Sales') || (label as string).includes('Expenses') ? fmt(v as number) : v}</div></div>
                ))}
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
                <div className="font-semibold mb-2">Recent Sales ({dates.from} → {dates.to})</div>
                {data.sales.filter(s => inRange(s.sale_date)).slice(0, 10).map(s => <div key={s.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{s.invoice_no} · {s.sale_date.slice(0, 10)}</span><span>{fmt(s.grand_total)} · Paid {fmt(s.paid)} · Balance {fmt(s.balance)}</span></div>)}
                {data.sales.filter(s => inRange(s.sale_date)).length === 0 && <div className="text-sm text-gray-500">No sales in this range.</div>}
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
                <div className="font-semibold mb-2">Recent Purchases</div>
                {data.purchases.slice(0, 10).map(p => <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{p.invoice_no} · {p.purchase_date}</span><span>{fmt(p.grand_total)} · {p.status}</span></div>)}
              </div>
            </div>
          )}
          {view !== 'dashboard' && data && (
            <ModulesView view={view} data={data} role={role} refresh={refresh} />
          )}
          {view !== 'dashboard' && !data && <div className="text-sm text-gray-500">Loading…</div>}
        </main>
      </div>
    </div>
  )
}

function ModulesView({ view, data, role, refresh }: { view: View; data: AllData; role: Role; refresh: () => void }) {
  switch (view) {
    case 'stock': return <StockPage data={data} role={role} refresh={refresh} />
    case 'pos': return <POSPage data={data} role={role} refresh={refresh} />
    case 'purchases': return <PurchasesPage data={data} role={role} refresh={refresh} />
    case 'repairs': return <RepairsPage data={data} role={role} refresh={refresh} />
    case 'parties': return <PartiesPage data={data} role={role} refresh={refresh} />
    case 'expenses': return <ExpensesPage data={data} role={role} refresh={refresh} />
    case 'cashbook': return <CashbookPage data={data} role={role} refresh={refresh} />
    case 'reports': return <ReportsPage data={data} role={role} refresh={refresh} />
    default: return null
  }
}
