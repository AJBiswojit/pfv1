/**
 * Resolves the backend source tree for the structural and contract tests.
 *
 * The backend lives in the repository's `backend/` directory, next to
 * `frontend/`. Older tests referred to a `pratikshya-backend/` folder that no
 * longer exists; this helper is the single place that knows the real location.
 *
 * These helpers only read files and locate the backend. They never start the
 * backend, open a database or change anything on disk.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `<repo>/backend`, derived from this file's own location (`frontend/tests/helpers`). */
export const BACKEND_ROOT = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "backend",
);

/** Reads a UTF-8 file relative to the backend root, e.g. `app/core/rbac.py`. */
export const readBackendSrc = (relative) => readFileSync(join(BACKEND_ROOT, relative), "utf8");
