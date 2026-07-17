# Security Policy

## Report privately

Do not open a public issue for a vulnerability or include credentials, customer information, supplier-confidential data, or production logs in any GitHub discussion.

Send the report privately to the GP Tyres & Mags repository maintainers. Include:

- The affected feature or endpoint
- Reproduction steps
- Expected impact
- Any known workaround or mitigation

Allow the maintainers time to investigate and deploy a fix before disclosing details elsewhere.

## Handling secrets

- Store local credentials in `.env.local`; never commit them.
- Keep service-role keys, provider keys, import tokens, and session secrets server-side.
- Never prefix a secret with `VITE_`, because Vite exposes those values to browser code.
- Rotate a credential immediately if it appears in a commit, screenshot, report, or log.
- Use separate, least-privilege credentials for development and production.
