# GP Tyres & Mags Business Intelligence Agent

## 1. Current-system assessment

The application already has strong foundations that should be retained:

- React/Vite staff portal with signed staff and admin sessions on the server.
- Supabase-backed physical inventory, sales history, CRM customers, quotations and audit-style system logs.
- Versioned supplier catalogue snapshots with a single active snapshot per supplier.
- Normalised tyre, wheel, stock-location, cost and selling-price fields.
- Existing quotation/POS, supplier sync, product-image and customer-hub workflows.

The previous fitment chat called a language model without live inventory tools, source logging, role-aware redaction, business memory or an approval loop. The new agent replaces that isolated chat path while reusing the existing operational systems.

## 2. Recommended architecture

```text
Staff portal / future website / future WhatsApp
                     |
             secure channel adapter
                     |
        GP Business Agent API (central layer)
          |          |          |         |
       policy     GLM-5.2    tool router   audit
          |                     |
          +----- deterministic business tools -----+
                 |         |        |       |
              inventory suppliers fitment quotes/CRM
                         Supabase
```

The central API owns identity, permissions, tool selection, validation, redaction, logging and model calls. Channels provide formatting and identity context only. GLM-5.2 interprets intent and writes the answer; it does not directly change stock, calculate money, run arbitrary SQL or browse arbitrary URLs.

## 3. Database changes

The first version adds:

- `ai_agent_conversations`: channel-independent conversation state.
- `ai_agent_messages`: question, answer, source, model, confidence and verification history.
- `ai_agent_tool_runs`: validated inputs, outputs, timing and errors for every tool.
- `ai_knowledge_documents`: versioned, approval-gated business knowledge.
- `ai_staff_feedback`: original question/answer plus a pending correction and review state.
- `ai_agent_settings`: pricing, fitment and response policies.
- `ai_agent_audit_logs`: actor, action, resource and change metadata.

Existing stable IDs remain the authority for inventory, supplier catalogue rows, customers and CRM documents. All new tables use RLS and are server-only; browser roles receive no direct grants.

Future phases can add canonical products/variants, vehicles, fitment rules, promotions, supplier reliability metrics, customer consent, channel identities and embeddings without changing the agent API contract.

## 4. Tool and function architecture

First-version tools:

| Tool | Data authority | Notes |
| --- | --- | --- |
| `search_inventory` | `inventory_items` | Physical GP stock only; selling price and verification time included. |
| `check_supplier_stock` | active supplier snapshots | Supplier stock remains separate; location stock and last sync included. |
| `compare_suppliers` | active supplier snapshots | Compares verified available rows; admin-only cost is redacted otherwise. |
| `find_alternative_products` | store + supplier tools | Returns exact-specification candidates and warns about fitment differences. |
| `find_vehicle_fitment` | approved knowledge + wheel metadata | Identifies missing safety fields and always requires physical confirmation. |
| `calculate_price` | deterministic application code | Admin internal mode only; VAT once, markup, then configurable rounding. |
| `calculate_margin` | deterministic application code | Admin internal mode only. |
| `analyze_sales_history` | `sales_log` | Aggregates verified historical units and revenue. |
| `create_quote` | deterministic application code + CRM | Preview first; saves a draft only after explicit staff confirmation. |
| `search_business_knowledge` | approved knowledge only | Customer-ready mode retrieves only customer-safe documents. |
| `save_staff_memory` | `ai_agent_staff_memories` | Saves only explicitly requested communication, workflow and recommendation preferences. |

All tool names are allow-listed. Inputs are length/range validated. Tool output is treated as untrusted data, logged, and supplied to the model as evidence—not instructions.

## 5. Retrieval and memory strategy

- Conversation memory: the current channel sends a bounded recent message window; full messages remain in Supabase.
- Staff memory: a staff member can say “remember…” to save a safe preference. Up to 12 active terminal-scoped preferences are loaded into each request. Secrets, customer personal information, changing stock/prices, fitment facts and unapproved policy are rejected.
- Customer memory: existing CRM customer and document records are the future consent-aware authority. The first release does not automatically attach a customer.
- Business memory: only `APPROVED` knowledge documents are retrievable. Full-text search is indexed now; embeddings can be added for larger document collections.
- Temporary memory: model/tool-loop messages exist only for the request and are not promoted into trusted knowledge.
- Staff learning: corrections are `PENDING`; an admin can approve one into a versioned knowledge document or reject it. The original answer and reviewer remain auditable.

Every durable memory record includes a source, timestamps, status and, where applicable, confidence.

## 6. Permission model

| Capability | Sales | Admin | Customer-ready answer |
| --- | ---: | ---: | ---: |
| Search GP/supplier stock | Yes | Yes | Yes, safe fields only |
| Selling prices | Yes | Yes | Yes |
| Supplier costs/margins | No | Yes, internal only | Never |
| Quote preview | Yes | Yes | Yes |
| Discounted quote | No | Admin authorisation | Approved result only |
| Save quote draft | Explicit confirmation | Explicit confirmation | Staff action only |
| Save staff preference | Explicit “remember” instruction | Explicit “remember” instruction | No customer write |
| Submit correction | Yes | Yes | No direct customer write |
| Approve knowledge | No | Yes | No |

Signed HttpOnly staff/admin cookies are checked by every agent route. UI visibility is not treated as authorisation.

## 7. Staff and customer workflows

Internal staff flow:

1. Staff asks in natural language.
2. The API verifies the staff/admin session and selects allowed tools.
3. Live inventory, supplier, fitment, sales or knowledge tools run.
4. Deterministic code handles price, margin and quote totals.
5. GLM-5.2 receives only permitted evidence and writes a concise answer.
6. The UI shows verification state, confidence and sources.
7. A correction is stored pending admin review.

Customer-ready flow uses the same core but removes cost/margin tools and internal knowledge, producing text that staff can send. Future website and WhatsApp adapters can call the same core with customer identity and channel formatting.

## 8. API integration structure

- `POST /api/business-agent`: staff-authenticated central endpoint for chat, pending feedback, admin review actions and tyre-visual research. Actions dispatch to isolated server modules behind one deployable function.
- `GET /api/business-agent?action=ADMIN_DASHBOARD`: admin-only review data.

Future adapters should translate their channel payload into the same message, mode, identity and conversation structure. WhatsApp webhooks must verify Meta signatures, map a consented customer identity, rate-limit, deduplicate messages and request human handoff before any sensitive action.

## 9. Phased implementation plan

1. First functional staff release: live inventory/supplier search, deterministic price/margin, safe fitment support, quote drafts, sources, feedback and admin approval.
2. Canonical catalogue: stable product variants, duplicate matching, vehicle/fitment tables and unmatched-product review.
3. Knowledge scale-up: document uploads, chunking, embeddings, version comparison and evaluation datasets.
4. Customer pilot: website chat, consent-aware customer memory, lead capture and staff handoff.
5. WhatsApp: verified Business Platform adapter, templates, media, conversation routing and SLA reporting.
6. Optimisation: supplier reliability, aged-stock recommendations, promotion rules, conversion analytics and supervised quality tuning.

## 10. First functional version

The implemented version provides:

- Staff and customer-ready modes in the portal agent.
- Customer-ready stock options are limited to products with at least two units and rendered as `SIZE BRAND PATTERN @ RPRICE`.
- Durable, terminal-scoped staff preference memory with explicit-save and server-side safety controls.
- Live physical and supplier stock search with source timestamps.
- Supplier comparison and safe alternatives.
- Fitment questions that identify missing information and require physical confirmation.
- Admin-only VAT/rounding, gross-profit and margin calculations in code.
- Deterministic quote preview and explicitly confirmed CRM draft creation.
- Sales-history aggregation.
- Source/confidence display.
- Pending staff corrections and an admin approval screen.
- Server-side GLM-5.2 calls; no model credential is shipped to the browser.

## 11. Setup and environment variables

Required server variables:

```text
NVIDIA_API_KEY=<rotated NVIDIA API key>
NVIDIA_AGENT_MODEL=z-ai/glm-5.2
SUPABASE_URL=<project URL>
SUPABASE_SECRET_KEY=<server-only Supabase secret key>
GP_STAFF_SESSION_SECRET=<32+ random characters>
GP_ADMIN_SESSION_SECRET=<32+ random characters>
GP_ADMIN_PASSWORD_SHA256=<SHA-256 admin-password hash>
GP_STAFF_CREDENTIALS_JSON=<optional server-owned terminal credential JSON>
```

`NVIDIA_API_KEY` and Supabase secret keys must exist only in the hosting provider's encrypted server environment. Do not use `VITE_` prefixes for them. Rotate any credential pasted into chat, source, browser storage or logs before production use.

Apply `20260715160911_gp_business_agent_v1.sql` to the linked Supabase project before enabling the UI.

## 12. Testing and evaluation

Release gates:

- Unit tests for query normalisation, supplier-image reuse, VAT-once rounding, margin and permission redaction.
- API tests for missing/expired staff cookie, sales/admin tool differences, rate limits, explicit quote confirmation and pending feedback.
- Database checks for RLS, grants, required indexes, constraints and audit inserts.
- End-to-end tests for live stock search, supplier comparison, customer-ready redaction, fitment uncertainty, quote preview/save and correction approval.
- Adversarial tests for prompt injection inside catalogue/document content, secret requests, unauthorised cost queries, duplicate quote actions and customer-data leakage.
- Accuracy datasets covering tyre sizes, PCD/offset/centre bore, load/speed ratings, current prices, supplier locations and out-of-stock alternatives.

An answer fails evaluation if it invents stock, price, specification, fitment, delivery, promotion or warranty; exposes unauthorised internal data; omits important uncertainty; or performs a sensitive write without confirmation.
