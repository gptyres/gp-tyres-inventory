<p align="center">
  <img src="assets/gp-tyres-logo-transparent.png" width="160" alt="GP Tyres & Mags logo">
</p>

<h1 align="center">Inventory Tracker</h1>

<p align="center">
  Internal retail operations software for GP Tyres & Mags.
  <br>
  Inventory, supplier stock, quotations, POS, customers, orders, and wheel fitment in one workspace.
</p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-20232a?logo=react&logoColor=61dafb">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-103%20passing-2ea44f">
</p>

> [!IMPORTANT]
> This is a private business application. Never commit credentials, customer information, supplier-confidential data, or production exports.

## What it does

The Inventory Tracker gives staff a single, responsive interface for daily tyre-and-wheel retail operations:

- Search and manage tyre, wheel, and suspension inventory
- Sell, reserve, refund, and adjust stock
- Build quotes and invoices through the point-of-sale workflow
- Track customers, orders, backorders, and shift reconciliation
- Search consolidated supplier catalogues and branch availability
- Browse wheel imagery and vehicle PCD fitment data
- Synchronise operational data with Supabase and Google Sheets
- Review system activity through protected admin tools

The interface is designed for fast counter-service work on desktop and mobile, with a compact dark theme and role-aware controls.

## Stack

| Layer | Technology |
| --- | --- |
| Application | React 19, TypeScript, Vite |
| Data | Supabase, Google Sheets |
| APIs | Vercel Functions, Supabase Edge Functions |
| Documents | jsPDF, PDF.js, XLSX |
| Testing | Vitest |
| Deployment | Vercel |

## Quick start

### Requirements

- Node.js 20+
- npm 10+
- Supabase project credentials

### Install

```bash
git clone https://github.com/gptyres/gp-tyres-inventory.git
cd gp-tyres-inventory
npm install
```

Create your local environment file:

```powershell
Copy-Item .env.example .env.local
```

For macOS or Linux:

```bash
cp .env.example .env.local
```

Add the required values to `.env.local`, then start the app:

```bash
npm run dev
```

Vite will print the local development URL, normally `http://localhost:5173`.

## Configuration

The committed [.env.example](.env.example) documents the supported core configuration.

| Variable | Scope | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Browser | Supabase anonymous/publishable key |
| `SUPABASE_URL` | Server | Supabase project URL for API handlers |
| `SUPABASE_SECRET_KEY` | Server | Privileged Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Alternative service-role key |
| `GP_ADMIN_PASSWORD_SHA256` | Server | SHA-256 hash used by admin authentication |
| `GP_ADMIN_SESSION_SECRET` | Server | Admin session-signing secret |
| `GP_STAFF_SESSION_SECRET` | Server | Staff session-signing secret |
| `GP_STAFF_CREDENTIALS_JSON` | Server | Optional staff credential map override |

Only public browser configuration may use the `VITE_` prefix. Provider keys, service-role keys, import tokens, and session secrets must remain server-side.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the complete Vitest suite once |

The repository also contains specialist wheel-catalogue import, audit, quarantine, OCR, and analysis commands. Review `package.json` and the relevant file in `scripts/` before running them. Prefer a dry run whenever one is available.

## Repository map

```text
.
├── api/                    Vercel API handlers
├── assets/                 Application and brand assets
├── components/             React screens and shared UI
├── docs/                   Operational and integration guides
├── google-apps-script/      Google Sheets integration
├── pricing-processor/       Quote and pricing normalisation
├── scripts/                 Import, audit, and catalogue utilities
├── server/                  Authentication and server data access
├── supplier_data/           Normalised supplier datasets
├── supabase/
│   ├── functions/           Supabase Edge Functions
│   └── migrations/          Database migrations
├── App.tsx                  Application shell
└── types.ts                 Shared domain types
```

## Development workflow

Create a focused branch, keep operational exports out of commits, and run both checks before requesting review:

```bash
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull-request checklist and [SECURITY.md](SECURITY.md) for responsible vulnerability reporting.

## Guides

- [Product principles](PRODUCT.md)
- [Photo library](docs/PHOTO_LIBRARY.md)
- [Quote module](docs/QUOTE_MODULE.md)
- [Supplier portal synchronisation](docs/SUPPLIER_PORTAL_SYNC_SETUP.md)
- [Wheel catalogue synchronisation](docs/wheel-catalog-sync.md)

## Status and ownership

This repository is actively developed for internal GP Tyres & Mags operations. It is not an open-source package and no public licence is granted.

Copyright © GP Tyres & Mags. All rights reserved.
