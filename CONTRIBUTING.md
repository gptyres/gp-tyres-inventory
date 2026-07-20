# Contributing

This repository supports a live retail operation. Changes should be focused, reviewable, and safe to deploy.

## Before you start

- Create a branch for one clear change.
- Check for existing work in the same area.
- Never use real customer data, production credentials, or supplier-confidential exports in development fixtures.
- Document new environment variables and database migrations.

## Before requesting review

Run:

```bash
npm test
npm run build
```

Then confirm that:

- Business calculations are deterministic and tested.
- Stock, quote, and payment changes handle failure safely.
- The interface remains keyboard-accessible and usable on narrow screens.
- Screenshots contain no private data.
- Generated reports and local working files are not included.
- The release version is incremented in `package.json` and `config.ts` before each GitHub and Vercel deployment.

## Pull requests

Describe the problem, the chosen solution, and how you verified it. Include screenshots for visible UI changes and call out migrations, deployment steps, or operational risks.

Keep unrelated refactors out of the same pull request. Use short, imperative commit subjects such as `Fix supplier price rounding` or `Add reservation validation`.
