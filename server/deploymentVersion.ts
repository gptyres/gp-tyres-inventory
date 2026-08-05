import { APP_VERSION } from '../config.js';

const firstConfiguredValue = (...values: Array<string | undefined>) => (
  values.map((value) => value?.trim()).find(Boolean) || APP_VERSION
);

/**
 * Vercel exposes VERCEL_DEPLOYMENT_ID during both build and runtime. Because it
 * changes for every deployment, binding sessions to it guarantees that a newly
 * promoted build invalidates every cookie issued by the previous build.
 * GP_SESSION_RELEASE_ID is an optional escape hatch for non-Vercel hosting.
 */
export const getSessionReleaseId = () => firstConfiguredValue(
  process.env.GP_SESSION_RELEASE_ID,
  process.env.VERCEL_DEPLOYMENT_ID,
  process.env.VERCEL_GIT_COMMIT_SHA,
  APP_VERSION
);
