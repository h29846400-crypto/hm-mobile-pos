# HM Mobile POS — Standalone Vercel-Ready App

HM Mobile Repairing Lab and Training Center, City Thana Road, Rajoa Chowk, Chiniot, Pakistan.
Currency PKR, timezone Asia/Karachi, English/Urdu with RTL. React + Vite + TypeScript + Tailwind, Supabase only (no server code, no secrets in the frontend).

## What it does
- Supabase Auth login (email/password), role-based menu: Admin = all, Cashier = Dashboard/POS/Stock/Purchases/Customers/Expenses/Cashbook, Technician = Dashboard/Repairs. Visible "Supabase Connected" status.
- Dashboard (calculated from transactions, Today/Yesterday/Week/Month/Custom filters, global search across products/customers/suppliers/sales/purchases/repairs/expenses — sale price only, cost never shown).
- Stock (totals, low/out lists, search, +/- adjust, stock ledger), Purchases (supplier select + inline new supplier, multi-line, profit-% per line sets sale price, draft/confirm, confirm increases stock with weighted-average cost), POS Sales (search by name/SKU/barcode, category filters, cart, per-line + total discount, Admin-only custom price, Walk-in/customer, cash/credit/partial, Cash/Bank/JazzCash/Easypaisa/Card, one-step stock decrease + customer balance, printable receipt headed HM MOBILE, City Thana Road, Rajoa Chowk, Chiniot, 03461412334, sales history + Sales Return restoring stock), Repairs (full ticket, auto job no, IMEI optional, 7 statuses, parts deducted from stock, repair profit, printable receipt), Customers/Suppliers ledgers with payment recording, Expenses, Cashbook, Reports (P&L, profit by product/category using avg-cost COGS, repair profit, inventory valuation, outstanding lists, CSV export).

## Hard rules
- Sale price ONLY in product/stock lists and dashboard search — cost/purchase price never shown there (only inside purchase/stock-entry forms).
- Stock entry and purchase lines offer profit-% that auto-calculates sale price from cost (sale = cost + %).
- No negative stock without admin override; confirmed financial documents are never deleted — returns are reversals only.

## Local run
```bash
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable key only)
npm install
npm run dev            # http://localhost:5173
npm run build          # production build -> dist/
```

## Deploy to Vercel (free Hobby plan)
1. Push this folder to a GitHub repo (do NOT commit `.env`).
2. In Vercel: Add New → Project → import the repo.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Environment variables (Project Settings → Environment Variables):
   - `VITE_SUPABASE_URL` = your Supabase Project URL, e.g. `https://dkufebypakkkzkagesia.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable key (the `sb_publishable_…` key from Settings → API)
   - Never add the secret / service-role key or the database password.
5. Deploy. You get a free link like `https://hm-mobile-pos.vercel.app` — bookmark it on PC and mobile, and add it to the home screen for an app-like icon.
6. Supabase Auth users must already exist (Dashboard → Authentication → Users, Auto Confirm User on): admin@hmmobile.pk, cashier@hmmobile.pk, tech@hmmobile.pk. The app does not auto-create users.

## Supabase setup (already done for this shop)
Migrations `001_init.sql` + `002_grants_policies.sql` already run with RLS on and authenticated-only policies. Tables: users, products, categories, units, suppliers, customers, purchases, purchase_items, sales, sale_items, repairs, repair_parts, expenses, payments, cashbook, returns, return_items, stock_movements, invoice_files, audit_logs, app_settings.
