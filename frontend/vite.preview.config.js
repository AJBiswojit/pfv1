/**
 * PRATIKSHYA FASHION — Phase 1.5/1.6 hero preview config (DEVELOPMENT ONLY).
 *
 * `npm run dev`, `npm run build` and every deployed configuration keep using
 * `vite.config.js` untouched. This file exists only for:
 *
 *   npx vite --config vite.preview.config.js
 *
 * which starts the normal dev server (same plugins, same /api proxy, same
 * aliases) plus one dev-only middleware, `preview/vite-preview-server.mjs`, that:
 *
 *   · serves the harness document at the server ROOT — a live preview panel
 *     opens the root, so the harness must be what a browser actually lands on;
 *     the untouched application is still served at /index.html and /app;
 *   · serves canonical media URLs (`/api/v1/media/objects/<key>`) from the
 *     approved frontend asset library when the bytes exist locally, falling
 *     through to the backend proxy otherwise;
 *   · serves the approved `home-page/` design assets used by the preview
 *     fixtures under the preview-only `/__preview-assets/<name>` namespace.
 *
 * The middleware is `apply: "serve"`, so it never runs during a build.
 *
 * Removal: delete this file, `preview/`, `preview.html` and
 * `src/components/storefront/preview/`.
 */

import baseConfig from "./vite.config.js";
import previewHarnessServer from "./preview/vite-preview-server.mjs";

/**
 * The whole dependency set this harness can reach, declared UP FRONT.
 *
 * Why: a Vite dev server that discovers a dependency while a page is loading
 * re-runs its optimizer. The optimizer rewrites every `/node_modules/.vite/deps/*`
 * URL with a new `?v=<hash>`; the previous hashes are then answered with
 * `504 Outdated Optimize Dep` (empty body, not logged in the terminal). The
 * harness entry imports React, React DOM and React Router ONLY from those
 * hashed URLs, so a 504 there means the entry module never executes, nothing
 * mounts, and the reviewer sees a white page.
 *
 * Listing all ten packages (exactly what Vite had already optimized — nothing
 * new, no version change) makes the optimizer bundle them in one pass at
 * startup and leaves the hashes stable for the whole review session.
 *
 * This file is dev-only: `npm run dev`, `npm run build` and every deployed
 * configuration keep using `vite.config.js`, which is untouched.
 */
const PREVIEW_OPTIMIZE_DEPS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-router-dom",
  "clsx",
  "tailwind-merge",
  "framer-motion",
  "lucide-react",
];

export default {
  ...baseConfig,
  optimizeDeps: {
    ...(baseConfig.optimizeDeps ?? {}),
    include: [...new Set([...(baseConfig.optimizeDeps?.include ?? []), ...PREVIEW_OPTIMIZE_DEPS])],
  },
  plugins: [...(baseConfig.plugins ?? []), previewHarnessServer()],
};
