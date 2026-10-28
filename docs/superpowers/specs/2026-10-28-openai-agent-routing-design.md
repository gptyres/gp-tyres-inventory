# GP Business Agent: OpenAI and task-based routing

## Intent

Connect the existing internal business agent to the user's OpenAI project, avoid top-tier models, and choose a suitable inexpensive model for each task without losing stock, pricing, fitment, staff-permission or audit safeguards.

## Approaches

1. **Automatic OpenAI model selection (chosen):** Keep one agent and its existing tools, use a small model for simple non-stock writing, and a more capable small model for inventory, supplier, pricing, fitment and uncertain requests. Keep NVIDIA GLM for the existing visual lookup only. This minimizes manual choices and preserves the existing tool loop.
2. **Manual selection per request:** Let staff choose a model each time. This provides control but adds friction and could lead to weaker models being used for sensitive inventory or fitment tasks.

## Design and boundaries

- Default to `gpt-4.1-mini` for stock/tool-dependent, fitment, price, quotation, ambiguous and general questions; use `gpt-6-luna` only for clearly identified, non-inventory writing tasks. The user approved Luna after GPT-4.1 nano returned model_not_found. The server chooses from an explicit allowlist; user input cannot request arbitrary model IDs.
- Preserve deterministic verified stock answers, stock sources, permission checks, quote and financial logic, tool limits, audit logging, user-visible uncertainty and customer-ready formatting. No automatic stronger-model fallback, no unapproved writes and no secret in client code or logs.
- Use the OpenAI chat-completions tool calling interface for the existing small server-side tool loop. The existing NVIDIA image-verification integration is unchanged; there is no NVIDIA fallback for text.
- Store the new key as a server-side production secret, with explicit user confirmation of that destination. Preserve the previous deployment and environment configuration for rollback.
- Treat model choice as a bounded heuristic, not a guarantee of correctness; stock and fitment must still be verified by tools and staff.

## Verification

Add tests for routing, provider requests, missing keys, error redaction, deterministic paths and existing stock/permission safeguards. Run the relevant and full tests, type checks and build. Verify selected-model API access and a non-sensitive live agent flow after deployment, reporting any billing/access errors without exposing credentials.
