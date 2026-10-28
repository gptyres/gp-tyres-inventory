# OpenAI Business Agent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Connect the GP Business Agent to the approved OpenAI project with automatic, modest-cost task-based models.

**Architecture:** Preserve the current authenticated server endpoint, deterministic stock paths, tool execution and database logging. Route clearly identified non-stock writing to user-approved `gpt-6-luna` (non-reasoning mode), and all stock, price, fitment, quote or unknown requests to `gpt-4.1-mini`; use OpenAI's chat-completions tool protocol. The NVIDIA visual handler remains untouched.

**Tech Stack:** TypeScript, Vercel Functions, OpenAI Chat Completions, Supabase, Vitest.

**Spec:** docs/superpowers/specs/2026-10-28-openai-agent-routing-design.md

## Global Constraints

- Keep secrets server-side, out of source, logs and browser bundles; use the approved production secret destination.
- Preserve staff authentication, admin-only tools, deterministic prices, verified stock sources, fitment caution, customer-ready formatting, memory and audit logs.
- Do not use top-tier models or route text to NVIDIA; do not modify the NVIDIA image lookup.
- User input and provider responses are untrusted. Never let them select model IDs or bypass tool permission checks.
- Expose safe provider errors; do not silently fall back to unverified stock or another provider.

## Review Focus

- A writing request that also asks about stock, prices or fitment must use the tool-capable default, not the lightweight writing tier.
- Unknown and multilingual prompts must use the default; user-supplied model names must not change routing.
- Unauthorized requests and missing credentials must fail without provider calls or leaking keys.
- Deterministic stock results must retain their existing stock/quantity rules and source attribution.
- Provider timeout, malformed responses and quota errors must not expose secrets or claim verified results.

### Task 1: OpenAI provider and routing

**Files:** `server/gpBusinessAgent.ts`, `server/gpBusinessAgentRouting.ts`, `server/gpBusinessAgentRouting.test.ts`, `api/business-agent.ts`, related tests.

**Interfaces:** `selectAgentModel(message: string): 'gpt-6-luna' | 'gpt-4.1-mini'`; `runGpBusinessAgent(apiKey, context, messages)` remains the endpoint interface.

- [ ] Add routing tests for non-stock writing, stock/price/fitment/quotation terms, mixed intents, ambiguous and multilingual input, and malicious requested model IDs; watch them fail.
- [ ] Implement the bounded selector and OpenAI chat-completions request with compatible tool calling, timeouts and sanitized errors; use `OPENAI_API_KEY` server-side.
- [ ] Test request bodies, tool round trips, missing credentials, failure handling and unchanged deterministic stock/customer/admin behavior.
- [ ] Run focused tests, both type checks and the full test suite; commit only task files.

### Task 2: Secure production configuration and release

**Files:** Vercel production environment and deployment, with no secret committed.

- [ ] Confirm the live deployment is still based on the reviewed production revision; preserve rollback.
- [ ] Store the user-approved key as a production-only secret without exposing it in output, logs, source, process arguments or browser code.
- [ ] Make a minimal authorized API smoke test for each selected model; distinguish missing balance, permissions and request errors.
- [ ] Build, push, release to production, and verify authenticated staff requests, selected models, sources and deterministic stock formatting. Report test gaps and runtime issues honestly.
