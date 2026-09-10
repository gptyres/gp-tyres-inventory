# Version 5.0.0 — Inventory workspace upgrade

This update keeps GP's existing navigation and retail workflows while making daily stock decisions easier to reach.

## What changed

- A counter-focused dashboard puts stock search, POS, quotes, and supplier search at the top.
- The attention panel links owned out-of-stock and low-stock counts to filtered inventory, and flags late incoming deliveries and overdue workshop jobs.
- Owned stock has explicit All, In stock, Low stock (1–3 units), and Out of stock filters. Search and category filters combine with availability; Clear filters restores the full list.
- Search suppliers for this carries the current query into the existing selected-supplier search. Supplier-specific availability and price calculations are preserved.
- Ctrl/Cmd+K reveals and focuses search. It does not intercept typing or active stock/POS modal workflows.
- View mode, sort, grouping, and column settings are stored per terminal/user and catalogue. Desktop defaults to Sheet and mobile defaults to List; a saved choice takes precedence. Cost visibility always requires current admin access.
- The mobile inventory screen has an expandable Display & sorting panel. Tabular figures, sticky table headings, clearer typography, browser zoom, and reduced-motion support improve readability.
- Workshop refresh failures keep the last successful figures and timestamp. An initial failure shows unknown values instead of zero; Retry reloads activity. Supplier sync failures also show an explicit unavailable/stale status.

## Verification and release state

- 409 unit tests pass across 52 files; production build passes with the existing large-chunk warnings.
- Browser checks cover stock filters, search handoff, preference restoration, cost masking, workshop failures/recovery, keyboard focus, and narrow-screen overflow.
- Quote generation, a sale, and a reservation were exercised against isolated local sample data. Live integrations were not used for these checks.
- The repository-wide TypeScript check still reports existing errors in unrelated wheel-catalogue, Supabase/Deno, and test code. No errors were reported in the changed workspace components.
- No database schema, public API, supplier pricing, or transaction semantics changed. Existing local supplier/sidebar edits were retained.
- Version 5.0.0 was approved after local-preview review. Release builds use the committed source; local sample-data tooling and exports are excluded.
