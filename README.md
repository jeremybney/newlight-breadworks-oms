# Newlight Breadworks — OMS

Internal order management system for Newlight Breadworks. Built with Next.js 14, Firebase/Firestore, and deployed on Netlify.

---

## What it does

A full-stack web app for managing wholesale bakery orders from entry through production, delivery, and invoicing. Accessible on desktop and mobile.

---

## Features

### Orders
- **New Order** — Select a customer, set a delivery date, add products with quantities and slicing preferences, apply fuel or credit card surcharges, and submit. Automatically creates a FreshBooks invoice on submission.
- **Edit Orders** — View, update, or cancel existing orders by date.
- **Recurring Orders** — Set up daily, weekly, or bi-weekly standing orders for a customer.

### Production & Baking
- **Production** — Daily production sheet showing all items ordered, grouped by dough category. Includes a Slice tab showing slicing requirements by product.
- **Mix Sheet** — Calculates dough weights (grams and kilos) required for Today's and Next Day's orders, based on each product's unit weight. Also shows Pre-Ferment requirements (Levain, Standard Poolish, Whole Wheat Poolish), Bin Breakdowns, and a container type guide.
- **Stickers** — Generates printable delivery stickers per customer, showing distributor, route, items, slicing, and packaging info.

### Reporting
- **Reports** — Generate an AutoRoute XLSX (matching the NL AutoRoute format with AutoRoute and RouteRevenue tabs) and Sign-Off / MRS PDFs. Filterable by distributor and route.
- **Forecast** — Forward-looking order view.

### Admin
- **Customers** — Full customer database with pricing, slicing preferences, distributor, route, packaging type, address, and delivery notes.
- **Products** — Product catalogue organised by dough category. Each product has a name, sliceable flag, active/inactive toggle, and unit weight (grams) used by the Mix Sheet.
- **Import CSV** — Bulk-import customers from a CSV file.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| Styling | Tailwind CSS |
| Invoicing | FreshBooks API |
| Spreadsheets | ExcelJS |
| PDFs | jsPDF + jsPDF-AutoTable |
| Hosting | Netlify |

---

## Roles

| Role | Access |
|---|---|
| `admin` | Everything |
| `staff` | Orders, Production, Mix Sheet, Stickers, Reports, Forecast |
| `baker` | Production, Mix Sheet, Stickers, Forecast, New Order |

Users are created in Firebase Authentication and assigned a role document in the `users` Firestore collection.
