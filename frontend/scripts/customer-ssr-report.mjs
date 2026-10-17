/**
 * PHASE 2D — evidence tool (not part of the application).
 *
 * Renders the ported homepage through the real module graph, twice: once with
 * production data only (the live catalogue / offer register, i.e. what a visitor
 * gets) and once with the design's own labelled preview fixtures substituted
 * through the port's seams (what a reviewer compares against the design). Then
 * reports what the production build actually contains.
 *
 *   cd frontend && node scripts/customer-ssr-report.mjs
 */
import { createServer } from "vite";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";

/** The ported page, in both data modes, rendered server-side. */
const vite = await createServer({ root: process.cwd(), logLevel: "error", server: { middlewareMode: true }, appType: "custom" });
const render = (element) => renderToStaticMarkup(React.createElement(MemoryRouter, null, element));
const sections = [
  "announce", "header", "hero__", "collage", "saree", "bridal", "jewel", "promo",
  "men__", "kids", "best", "kurti", "news", "trust", "footer",
];
const count = (html, re) => (html.match(re) || []).length;

try {
  const mod = await vite.ssrLoadModule("/src/components/customer/CustomerStorefront.jsx");
  const Mount = mod.default;

  const live = render(React.createElement(Mount));
  console.log("── production data (no backend in the sandbox) ──");
  console.log("   markup chars:", live.length);
  console.log("   design sections present:", sections.filter((m) => live.includes(`class="${m}`) || live.includes(`class="container ${m}`)).length, "/", sections.length);
  console.log("   product cards:", count(live, /class="pcard/g), "| offers band:", live.includes('class="promo'), "| design plates:", new Set([...live.matchAll(/\/design\/[a-z0-9-]+\.webp/g)].map((m) => m[0])).size);
  console.log("   sample copy anywhere:", /UTSAV15|Sample offer|care@|festive-preview/.test(live) ? "PRESENT" : "none");

  const { setPreviewCatalogueSource } = await vite.ssrLoadModule("/src/components/customer/mock/data/products.js");
  const { setPreviewPromotionSource } = await vite.ssrLoadModule("/src/components/customer/mock/data/promotions.js");
  const { setPreviewNewsletterService } = await vite.ssrLoadModule("/src/components/customer/services/newsletter.js");
  const fixtures = await vite.ssrLoadModule("/src/components/storefront/preview/previewCustomerFixtures.js");
  setPreviewCatalogueSource(fixtures.CUSTOMER_PREVIEW_PIECES);
  setPreviewPromotionSource(fixtures.PREVIEW_CUSTOMER_PROMOTION);
  setPreviewNewsletterService(fixtures.PREVIEW_CUSTOMER_NEWSLETTER);

  const preview = render(React.createElement(Mount));
  console.log("── the same port, reference fixtures substituted (review surface) ──");
  console.log("   markup chars:", preview.length);
  console.log("   design sections present:", sections.filter((m) => preview.includes(`class="${m}`) || preview.includes(`class="container ${m}`)).length, "/", sections.length);
  console.log("   product cards:", count(preview, /class="pcard[\s-]/g), "| prices:", (preview.match(/₹[0-9,]+/g) || []).slice(0, 3).join(" "));
  console.log("   newsletter live:", preview.includes('disabled=""') ? "has a disabled control" : "interactive");
  console.log("   destinations:", [...new Set([...preview.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]))].filter((h) => !h.startsWith("/design/")).slice(0, 12).join(" "));
} catch (error) {
  console.error("PROBE FAILED:", error?.message);
  process.exitCode = 1;
} finally {
  await vite.close();
}

/* ── the built bundle ─────────────────────────────────────────────── */
const dist = readdirSync("dist");
const html = readFileSync("dist/index.html", "utf8");
const plates = readdirSync("dist/design").filter((f) => f.endsWith(".webp"));
const mediaUnchanged = readdirSync("dist/images").length;
console.log("── the build this port ships in ──");
console.log("   dist entries:", dist.length, "| design plates:", plates.length, "| app media files:", mediaUnchanged);
console.log("   port CSS in the bundle:", html.includes(".aan-root"), "| unscoped design selector:", /(?<![-\w])(?:html|body|:root)\s*\{/.test(html) ? "CHECK" : "none added by the port");
console.log("   ported shell markers in the bundle:", ["aan-root", "announce__track", "collage__tile--women", "promo__ledger", "mmenu__col"].filter((m) => html.includes(m)).join(", "));
