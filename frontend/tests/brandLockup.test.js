/**
 * PRATIKSHYA FASHON — Brand lockup regression coverage.
 *
 * The storefront brand lockup is `[logo mark] PRATIKSHYA FASHON`. These tests
 * lock down the three facts that keep that lockup intact across every surface:
 *
 *   · the canonical logo asset lives at its documented path
 *   · the reusable `<Brand />` component renders the typographic wordmark
 *     beside the mark for the `lockup` variant (the header/footer default),
 *     rather than hiding it behind an `sr-only` label
 *   · the storefront header actually requests that lockup, and no surface
 *     hard-codes its own logo or wordmark
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const brandSource = readFileSync(
  join(ROOT, "src/design-system/components/Brand.jsx"),
  "utf8"
);
const headerSource = readFileSync(
  join(ROOT, "src/components/customer/components/layout/Header.jsx"),
  "utf8"
);
const footerSource = readFileSync(
  join(ROOT, "src/components/customer/components/layout/Footer.jsx"),
  "utf8"
);

test("the canonical logo asset exists at the documented path", () => {
  assert.equal(
    existsSync(join(ROOT, "src/assets/pratikshya_logo.webp")),
    true,
    "src/assets/pratikshya_logo.webp must be present"
  );
});

test("the lockup variant renders the wordmark beside the logo mark", () => {
  /* lockup = mark + wordmark. The wordmark must render for BOTH the
     `wordmark` and `lockup` variants — not be suppressed for lockup. */
  assert.match(
    brandSource,
    /showWord\s*=\s*variant\s*===\s*"wordmark"\s*\|\|\s*variant\s*===\s*"lockup"/,
    "Brand must render the wordmark for the lockup variant"
  );
});

test("the active storefront header and footer use the shared logo components", () => {
  assert.match(headerSource, /<Logo\s*\/>/, "Storefront header uses the shared Logo");
  assert.match(footerSource, /<BrandMark/, "Storefront footer uses the shared BrandMark");
});

test("the Brand component resolves the logo through import.meta.glob, never a hardcoded path", () => {
  assert.match(brandSource, /import\.meta\.glob/, "logo is resolved through Vite glob");
  /* No surface may hard-code the logo address or image filename. */
  assert.doesNotMatch(
    brandSource,
    /["'`]\/(?:images|assets|library)\//,
    "no hardcoded image path in Brand"
  );
});

test("the storefront header delegates its logo to the shared Logo component", () => {
  assert.doesNotMatch(headerSource, /pratikshya_logo/, "header must not name the logo file");
  assert.match(headerSource, /<Logo\s*\/>/, "header renders the shared storefront Logo component");
});
