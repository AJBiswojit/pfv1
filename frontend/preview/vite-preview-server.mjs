/**
 * PRATIKSHYA FASHION — dev-only middleware for the hero preview harness.
 *
 * Added ONLY by `frontend/vite.preview.config.js`, which is never used by
 * `npm run dev`, `npm run build` or any deployed configuration.
 *
 * Three jobs, all development-only, all read-only:
 *
 *   1. `/` → the harness document.
 *      A live preview panel opens the server's ROOT, so a harness that only
 *      lived at `/preview.html` was never the page under review — the root
 *      served the production `index.html` (the real storefront with the
 *      existing `HeroCarousel`). The root now serves `preview.html` on this
 *      server only. The untouched application stays reachable at `/index.html`
 *      (and the `/app` alias).
 *
 *      The surface the reviewer lands on is chosen by the harness itself
 *      (`src/components/storefront/preview/main.jsx`): this middleware rewrites
 *      paths only, never query strings, so every surface keeps its own URL.
 *
 *   2. `/api/v1/media/objects/<key>`
 *      The app's canonical media URL shape. When the approved frontend asset
 *      library holds the same object key (this is exactly how the Phase 6 media
 *      migration mapped `public/images/<key>` → the object store), the bytes are
 *      served from there. Anything else falls through to the normal Vite /api
 *      proxy, so a running backend always wins.
 *
 *   3. `/__preview-assets/<name>`
 *      Preview-only namespace for the approved `home-page/` design assets used
 *      by the harness fixtures (e.g. the portrait art-direction plate). These
 *      are never referenced by production code and never resolve outside the
 *      given directories.
 *
 * Nothing here writes, uploads or mutates anything, and `apply: "serve"` keeps
 * it out of every build.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

const OBJECT_URL_PREFIX = "/api/v1/media/objects/";
const FIXTURE_URL_PREFIX = "/__preview-assets/";

/** The harness document the review panel should land on. */
export const PREVIEW_DOCUMENT = "/preview.html";

/** The untouched application document, still served on this server. */
export const APPLICATION_DOCUMENT = "/index.html";

const CONTENT_TYPES = {
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
};

/** Resolve `requested` inside `base`, refusing traversal and missing files. */
const safeFile = (base, requested) => {
  const decoded = decodeURIComponent(requested).split("?")[0];
  const candidate = resolve(base, normalize(decoded).replace(/^(\.\.[/\\])+/, ""));
  const root = resolve(base);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
};

const sendFile = (res, file) => {
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream"
  );
  res.setHeader("Cache-Control", "no-store");
  createReadStream(file).pipe(res);
};

/** The approved frontend asset library — the same folder the Phase 6 media
 *  migration copied into the object store. */
const publicAssetRoot = (root) => join(root, "public", "images");

/** The approved home-page design assets (the storefront's visual source of
 *  truth for this project). Read-only, preview-only. */
const homePageAssetRoot = (root) => join(root, "..", "home-page", "public", "images");

export default function previewHarnessServer() {
  let projectRoot = process.cwd();

  return {
    name: "pf-preview-harness",
    apply: "serve",
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      /* Registered before Vite's internal middlewares, so rewritten requests
         are then handled — and transformed — by Vite itself. */
      server.middlewares.use((req, res, next) => {
        const [pathname, search = ""] = (req.url || "/").split("?");
        const query = search ? `?${search}` : "";

        if (pathname === "/") {
          req.url = `${PREVIEW_DOCUMENT}${query}`;
          return next();
        }

        if (pathname === "/app") {
          req.url = `${APPLICATION_DOCUMENT}${query}`;
          return next();
        }

        if (pathname.startsWith(OBJECT_URL_PREFIX)) {
          const file = safeFile(publicAssetRoot(projectRoot), pathname.slice(OBJECT_URL_PREFIX.length));
          if (file) return sendFile(res, file);
          return next();
        }

        if (pathname.startsWith(FIXTURE_URL_PREFIX)) {
          const file = safeFile(
            homePageAssetRoot(projectRoot),
            pathname.slice(FIXTURE_URL_PREFIX.length)
          );
          if (file) return sendFile(res, file);
          res.statusCode = 404;
          res.end("Preview fixture asset not found");
          return undefined;
        }

        return next();
      });
    },
  };
}
